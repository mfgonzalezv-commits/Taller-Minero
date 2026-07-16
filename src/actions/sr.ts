'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { EstadoSR } from '@prisma/client'

export async function crearSR(otId: string, data: {
  items: { descripcion: string; cantidad: number; unidad: string; itemBodegaId?: string; precioEstimado?: number }[]
  urgente: boolean
  observacion?: string
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const sr = await prisma.solicitudRepuesto.create({
    data: {
      otId,
      faenaId: session.user.faenaId,
      urgente: data.urgente,
      observacion: data.observacion || null,
      creadoPorId: session.user.id,
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
          usuarioId: session.user.id,
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
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const userId = session.user.id!
  const faenaId = session.user.faenaId!

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({
    where: { id: srId },
    include: { items: true },
  })

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

          await tx.movimientoBodega.create({
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

  revalidatePath(`/ot/${sr.otId}`)
  revalidatePath('/solicitudes-repuesto')
}

export async function getSRsByOT(otId: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.solicitudRepuesto.findMany({
    where: { otId, faenaId: session.user.faenaId },
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
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.solicitudRepuesto.findMany({
    where: {
      faenaId: session.user.faenaId,
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
