'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { EstadoSR } from '@prisma/client'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, auditar } from '@/lib/authz'
import { consumirFIFO } from '@/lib/fifo'
import { encolarCorreo } from '@/lib/correo'

export async function crearSR(otId: string, data: {
  items: { descripcion: string; cantidad: number; unidad: string; itemBodegaId?: string; precioEstimado?: number }[]
  urgente: boolean
  observacion?: string
}) {
  const sesion = await requireSesion()
  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, ot.faenaId)

  const sr = await prisma.solicitudRepuesto.create({
    data: {
      otId,
      faenaId: ot.faenaId,
      urgente: data.urgente,
      observacion: data.observacion || null,
      creadoPorId: sesion.userId,
      estado: 'ENVIADA',
      items: {
        create: data.items.map(i => ({
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          unidad: i.unidad,
          itemBodegaId: i.itemBodegaId || null,
          precioEstimado: i.precioEstimado ?? null,
        })),
      },
      historial: {
        create: {
          estadoNuevo: 'ENVIADA',
          usuarioId: sesion.userId,
          observacion: 'Solicitud creada',
        },
      },
    },
    select: { id: true, numeroSr: true },
  })

  await prisma.ordenTrabajo.update({
    where: { id: otId },
    data: { enEsperaRepuesto: true },
  })

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/solicitudes-repuesto')
  return sr
}

export async function cambiarEstadoSR(srId: string, nuevoEstado: EstadoSR, data?: {
  observacion?: string
  fechaEstimadaLlegada?: string
}) {
  const sesion = await requireSesion()

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({
    where: { id: srId },
    include: { items: true },
  })
  requireAlcanceFaena(sesion, sr.faenaId)
  const userId = sesion.userId

  await prisma.$transaction(async (tx) => {
    await tx.historialSR.create({
      data: {
        srId,
        estadoAnterior: sr.estado,
        estadoNuevo: nuevoEstado,
        observacion: data?.observacion || null,
        usuarioId: userId,
      },
    })

    await tx.solicitudRepuesto.update({
      where: { id: srId },
      data: {
        estado: nuevoEstado,
        gestionadoPorId: userId,
        ...(data?.fechaEstimadaLlegada ? { fechaEstimadaLlegada: new Date(data.fechaEstimadaLlegada) } : {}),
      },
    })

    // Al entregar: descontar stock de bodega y registrar RepuestoOT
    if (nuevoEstado === 'ENTREGADA') {
      for (const item of sr.items) {
        if (item.itemBodegaId) {
          const bodegaItem = await tx.itemBodega.findUniqueOrThrow({ where: { id: item.itemBodegaId } })
          const stockAntes = Number(bodegaItem.stockActual)
          const stockDespues = Math.max(0, stockAntes - Number(item.cantidad))

          await tx.itemBodega.update({
            where: { id: item.itemBodegaId },
            data: { stockActual: stockDespues },
          })

          const movSalida = await tx.movimientoBodega.create({
            data: {
              itemId: item.itemBodegaId,
              faenaId: sr.faenaId,
              tipo: 'SALIDA',
              cantidad: item.cantidad,
              stockAntes,
              stockDespues,
              otId: sr.otId,
              usuarioId: userId,
              observacion: `SR-${String(sr.numeroSr).padStart(4, '0')} entregada`,
            },
          })
          const consumos = await consumirFIFO(tx, item.itemBodegaId, Number(item.cantidad))
          for (const c of consumos) {
            await tx.consumoLoteBodega.create({
              data: { loteId: c.loteId, movimientoId: movSalida.id, cantidad: c.cantidad, costoUnitario: c.costoUnitario },
            })
          }

          await tx.repuestoOT.create({
            data: {
              otId: sr.otId,
              faenaId: sr.faenaId,
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              unidad: item.unidad,
              precioUnit: item.precioEstimado ?? bodegaItem.precioRef,
              total: Number(item.cantidad) * Number(item.precioEstimado ?? bodegaItem.precioRef),
              estadoSolicitud: 'ENTREGADO',
              itemBodegaId: item.itemBodegaId,
              registradoById: userId,
            },
          })
        } else {
          // Item sin bodega = externo
          await tx.repuestoOT.create({
            data: {
              otId: sr.otId,
              faenaId: sr.faenaId,
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              unidad: item.unidad,
              precioUnit: item.precioEstimado ?? 0,
              total: Number(item.cantidad) * Number(item.precioEstimado ?? 0),
              estadoSolicitud: 'EXTERNO',
              registradoById: userId,
            },
          })
        }
      }

      // Verificar si quedan otras SRs pendientes en la OT
      const srsPendientes = await tx.solicitudRepuesto.count({
        where: {
          otId: sr.otId,
          estado: { notIn: ['ENTREGADA', 'RECHAZADA'] },
          id: { not: srId },
        },
      })

      if (srsPendientes === 0) {
        await tx.ordenTrabajo.update({
          where: { id: sr.otId },
          data: { enEsperaRepuesto: false, estado: 'LISTO_PARA_REPARAR' },
        })
      }

      // Entrada en bitácora registrando la entrega
      const srNumero = `SR-${String(sr.numeroSr).padStart(4, '0')}`
      const itemsDesc = sr.items.map(i => `${i.descripcion} (${i.cantidad} ${i.unidad})`).join(', ')
      const descripcion = srsPendientes === 0
        ? `Repuestos entregados (${srNumero}): ${itemsDesc}. Sin solicitudes pendientes.`
        : `Repuestos entregados (${srNumero}): ${itemsDesc}. Quedan ${srsPendientes} solicitud(es) pendiente(s).`

      await tx.bitacoraOT.create({
        data: {
          otId: sr.otId,
          descripcion,
          tipoIntervencion: 'SOLICITUD_REPUESTO',
          setEspera: srsPendientes > 0 ? true : false,
          usuarioId: userId,
        },
      })
    }
  })

  // Correo formal a Bodega Central / Adquisiciones — quedan por ahora en
  // bandeja de salida (sin proveedor de correo configurado).
  if (nuevoEstado === 'EN_BODEGA_CENTRAL' || nuevoEstado === 'EN_ADQUISICIONES') {
    const srNumero = `SR-${String(sr.numeroSr).padStart(4, '0')}`
    const destino = nuevoEstado === 'EN_BODEGA_CENTRAL' ? 'Bodega Central' : 'Adquisiciones Central'
    const itemsDesc = sr.items.map(i => `- ${i.descripcion} × ${i.cantidad} ${i.unidad}`).join('\n')
    await encolarCorreo({
      faenaId: sr.faenaId,
      tipo: 'SOLICITUD_REPUESTO',
      entidadId: srId,
      destinatarios: [],
      asunto: `${srNumero} — Solicitud de repuesto${sr.urgente ? ' (URGENTE)' : ''}`,
      cuerpo: `Solicitud ${srNumero} para ${destino}.\n\nÍtems:\n${itemsDesc}\n\n${sr.observacion ?? ''}`,
    })
  }

  revalidatePath(`/ot/${sr.otId}`)
  revalidatePath('/solicitudes-repuesto')
}

// Compra directa/urgente autorizada por el jefe de taller, fuera del flujo
// normal — debe regularizarse después (Compras completa cotizaciones/orden).
export async function marcarCompraDirecta(srId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])
  if (!motivo?.trim()) throw new Error('Debe justificar la compra directa')

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, sr.faenaId)

  await prisma.solicitudRepuesto.update({
    where: { id: srId },
    data: { esCompraDirecta: true, motivoCompraDirecta: motivo.trim() },
  })

  await auditar({
    faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId,
    accion: 'MARCAR_COMPRA_DIRECTA', usuarioId: sesion.userId, motivo: motivo.trim(),
  })

  revalidatePath('/solicitudes-repuesto')
}

export async function regularizarCompraDirecta(srId: string, cotizaciones: string[]) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'COMPRAS'])

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, sr.faenaId)
  if (!sr.esCompraDirecta) throw new Error('Esta solicitud no es una compra directa')

  await prisma.solicitudRepuesto.update({
    where: { id: srId },
    data: { regularizada: true, regularizadaPorId: sesion.userId, fechaRegularizacion: new Date(), cotizaciones },
  })

  await auditar({
    faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId,
    accion: 'REGULARIZAR_COMPRA_DIRECTA', usuarioId: sesion.userId,
  })

  revalidatePath('/solicitudes-repuesto')
}

// Indicador mensual de compras fuera del flujo normal.
export async function getComprasDirectasDelMes() {
  const sesion = await requireSesion()
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  return prisma.solicitudRepuesto.findMany({
    where: { faenaId: sesion.faenaId, esCompraDirecta: true, createdAt: { gte: inicioMes } },
    include: { ot: { select: { numeroOt: true } }, creadoPor: { select: { nombre: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getSRsByOT(otId: string) {
  const sesion = await requireSesion()

  return prisma.solicitudRepuesto.findMany({
    where: { otId, faenaId: sesion.faenaId },
    include: {
      items: { include: { itemBodega: { select: { codigo: true, stockActual: true } } } },
      creadoPor: { select: { nombre: true } },
      gestionadoPor: { select: { nombre: true } },
      historial: { include: { usuario: { select: { nombre: true } } }, orderBy: { fechaCambio: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getSRsPendientes() {
  const sesion = await requireSesion()

  return prisma.solicitudRepuesto.findMany({
    where: {
      faenaId: sesion.faenaId,
      estado: { notIn: ['ENTREGADA', 'RECHAZADA'] },
    },
    include: {
      ot: { select: { numeroOt: true, equipo: { select: { codigo: true, nombre: true } } } },
      items: true,
      creadoPor: { select: { nombre: true } },
    },
    orderBy: [{ urgente: 'desc' }, { createdAt: 'asc' }],
  })
}
