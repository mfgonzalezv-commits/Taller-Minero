'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { EstadoSR } from '@prisma/client'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, auditar, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_BITACORA, ROLES_GESTION_OT } from '@/lib/permisos-roles'
import type { Rol } from '@/lib/roles'

const ROLES_CREAR_SR: Rol[] = [...ROLES_BITACORA, 'BODEGA']
const ROLES_GESTIONAR_SR: Rol[] = [...ROLES_GESTION_OT, 'BODEGA', 'COMPRAS']
import { salidaStockFIFO } from '@/lib/stock'
import { puedeTransicionarSR } from '@/lib/maquina-sr'
import { requiereAprobacionCentral, validarRegularizacion } from '@/lib/compra-directa'
import { encolarCorreo } from '@/lib/correo'

export async function crearSR(otId: string, data: {
  items: { descripcion: string; cantidad: number; unidad: string; itemBodegaId?: string; precioEstimado?: number }[]
  urgente: boolean
  observacion?: string
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_CREAR_SR)
  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, ot.faenaId)
  const idsItems = data.items.map(i => i.itemBodegaId).filter((x): x is string => !!x)
  if (idsItems.length) {
    const propios = await prisma.itemBodega.count({ where: { id: { in: idsItems }, faenaId: ot.faenaId } })
    if (propios !== new Set(idsItems).size) throw new ErrorAutorizacion('Sin permisos: algún ítem de bodega no pertenece a la faena de la OT')
  }

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
  requireRolPermitido(sesion, ROLES_GESTIONAR_SR)

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({
    where: { id: srId },
    include: { items: true },
  })
  requireAlcanceFaena(sesion, sr.faenaId)
  const userId = sesion.userId

  // Idempotente: repetir el mismo cambio (doble clic) no vuelve a registrar ni a descontar nada.
  if (sr.estado === nuevoEstado) return
  if (!puedeTransicionarSR(sr.estado, nuevoEstado)) throw new Error(`Transición no permitida: ${sr.estado} → ${nuevoEstado}`)

  const aplicado = await prisma.$transaction(async (tx) => {
    // Candado: solo una ejecución pasa del estado leído al nuevo. Si otra petición ya lo cambió, esta no hace nada.
    const cambio = await tx.solicitudRepuesto.updateMany({
      where: { id: srId, estado: sr.estado },
      data: {
        estado: nuevoEstado,
        gestionadoPorId: userId,
        ...(data?.fechaEstimadaLlegada ? { fechaEstimadaLlegada: new Date(data.fechaEstimadaLlegada) } : {}),
      },
    })
    if (cambio.count === 0) return false

    await tx.historialSR.create({
      data: { srId, estadoAnterior: sr.estado, estadoNuevo: nuevoEstado, observacion: data?.observacion || null, usuarioId: userId },
    })

    // Al entregar: el descuento FIFO ocurre UNA sola vez y en esta misma transacción (si falta stock, todo se revierte).
    if (nuevoEstado === 'ENTREGADA') {
      for (const item of sr.items) {
        if (item.itemBodegaId) {
          const bodegaItem = await tx.itemBodega.findUniqueOrThrow({ where: { id: item.itemBodegaId } })
          if (bodegaItem.faenaId !== sr.faenaId) throw new ErrorAutorizacion('Sin permisos: un ítem de la SR pertenece a otra faena')
          const salida = await salidaStockFIFO(tx, {
            itemId: item.itemBodegaId, faenaId: sr.faenaId, cantidad: Number(item.cantidad), usuarioId: userId, otId: sr.otId,
            observacion: `SR-${String(sr.numeroSr).padStart(4, '0')} entregada`,
          })
          await tx.repuestoOT.create({
            data: {
              otId: sr.otId, faenaId: sr.faenaId, descripcion: item.descripcion, cantidad: item.cantidad, unidad: item.unidad,
              precioUnit: salida.costoUnitario, total: salida.costoTotal, // costo real FIFO
              estadoSolicitud: 'ENTREGADO', itemBodegaId: item.itemBodegaId, registradoById: userId,
            },
          })
        } else {
          // Item sin bodega = externo
          await tx.repuestoOT.create({
            data: {
              otId: sr.otId, faenaId: sr.faenaId, descripcion: item.descripcion, cantidad: item.cantidad, unidad: item.unidad,
              precioUnit: item.precioEstimado ?? 0, total: Number(item.cantidad) * Number(item.precioEstimado ?? 0),
              estadoSolicitud: 'EXTERNO', registradoById: userId,
            },
          })
        }
      }

      // Verificar si quedan otras SRs pendientes en la OT
      const srsPendientes = await tx.solicitudRepuesto.count({
        where: { otId: sr.otId, estado: { notIn: ['ENTREGADA', 'RECHAZADA'] }, id: { not: srId } },
      })
      if (srsPendientes === 0) {
        await tx.ordenTrabajo.update({ where: { id: sr.otId }, data: { enEsperaRepuesto: false, estado: 'LISTO_PARA_REPARAR' } })
      }

      // Entrada en bitácora registrando la entrega
      const srNumero = `SR-${String(sr.numeroSr).padStart(4, '0')}`
      const itemsDesc = sr.items.map(i => `${i.descripcion} (${i.cantidad} ${i.unidad})`).join(', ')
      await tx.bitacoraOT.create({
        data: {
          otId: sr.otId,
          descripcion: srsPendientes === 0
            ? `Repuestos entregados (${srNumero}): ${itemsDesc}. Sin solicitudes pendientes.`
            : `Repuestos entregados (${srNumero}): ${itemsDesc}. Quedan ${srsPendientes} solicitud(es) pendiente(s).`,
          tipoIntervencion: 'SOLICITUD_REPUESTO',
          setEspera: srsPendientes > 0,
          usuarioId: userId,
        },
      })
    }
    return true
  })

  if (!aplicado) {
    const actual = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId }, select: { estado: true } })
    if (actual.estado === nuevoEstado) return // otra petición idéntica ya lo hizo
    throw new Error('La solicitud cambió de estado mientras se procesaba; recarga e intenta de nuevo')
  }

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
  if (sr.esCompraDirecta) return // idempotente: ya estaba marcada

  // Se permite sin cotizaciones previas solo por emergencia; el respaldo se exige al regularizar.
  const r = await prisma.solicitudRepuesto.updateMany({
    where: { id: srId, esCompraDirecta: false },
    data: { esCompraDirecta: true, motivoCompraDirecta: motivo.trim() },
  })
  if (r.count === 0) return

  await auditar({
    faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId,
    accion: 'MARCAR_COMPRA_DIRECTA', usuarioId: sesion.userId, motivo: motivo.trim(),
  })

  revalidatePath('/solicitudes-repuesto')
}

// Sobre el límite de faena, la compra directa necesita la aprobación del nivel central antes de regularizarse.
export async function aprobarCompraDirectaCentral(srId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL'])

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, sr.faenaId)
  if (!sr.esCompraDirecta) throw new Error('Esta solicitud no es una compra directa')
  if (sr.aprobadaCentralPorId) return // idempotente

  const r = await prisma.solicitudRepuesto.updateMany({
    where: { id: srId, aprobadaCentralPorId: null },
    data: { aprobadaCentralPorId: sesion.userId, fechaAprobacionCentral: new Date() },
  })
  if (r.count === 0) return

  await auditar({ faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId, accion: 'APROBAR_COMPRA_DIRECTA_CENTRAL', usuarioId: sesion.userId })
  revalidatePath('/solicitudes-repuesto')
}

// Regulariza una compra directa: exige comprobante, motivo y al menos una cotización de respaldo.
// Sobre el límite de faena requiere aprobación central. Idempotente: repetirla no cambia nada.
export async function regularizarCompraDirecta(srId: string, datos: { cotizaciones: string[]; comprobante: string; motivo: string; monto: number }) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'COMPRAS'])

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, sr.faenaId)
  if (!sr.esCompraDirecta) throw new Error('Esta solicitud no es una compra directa')
  if (sr.regularizada) return { yaRegularizada: true }

  const error = validarRegularizacion(datos)
  if (error) throw new Error(error)
  if (requiereAprobacionCentral(datos.monto) && !sr.aprobadaCentralPorId) {
    throw new Error('La compra supera el límite de faena: requiere aprobación central antes de regularizarse')
  }

  // El UPDATE condicionado es el candado: solo una regularización se aplica.
  const r = await prisma.solicitudRepuesto.updateMany({
    where: { id: srId, regularizada: false },
    data: {
      regularizada: true, regularizadaPorId: sesion.userId, fechaRegularizacion: new Date(),
      cotizaciones: datos.cotizaciones.map(c => c.trim()).filter(Boolean),
      comprobanteRegularizacion: datos.comprobante.trim(), motivoRegularizacion: datos.motivo.trim(), montoCompraDirecta: datos.monto,
    },
  })
  if (r.count === 0) return { yaRegularizada: true }

  await auditar({
    faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId,
    accion: 'REGULARIZAR_COMPRA_DIRECTA', usuarioId: sesion.userId, motivo: datos.motivo.trim(),
    valorNuevo: { comprobante: datos.comprobante.trim(), monto: datos.monto, cotizaciones: datos.cotizaciones.length },
  })

  revalidatePath('/solicitudes-repuesto')
  return { yaRegularizada: false }
}

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
