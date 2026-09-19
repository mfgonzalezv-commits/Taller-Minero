'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_AUTORIZAR_REPUESTO } from '@/lib/permisos-roles'
import type { Rol } from '@/lib/roles'

// Quién mueve stock hacia una OT: gestión de la faena o BODEGA.
const ROLES_ENTREGA: Rol[] = [...ROLES_AUTORIZAR_REPUESTO, 'BODEGA']
const ROLES_RECEPCION_COMPRAS: Rol[] = [...ROLES_ENTREGA, 'COMPRAS']

// El ítem de bodega debe ser de la misma faena que la OT/solicitud (aunque el actor tenga alcance central).
async function requireItemDeFaena(itemId: string, faenaId: string) {
  const item = await prisma.itemBodega.findUnique({ where: { id: itemId }, select: { faenaId: true } })
  if (!item || item.faenaId !== faenaId) throw new ErrorAutorizacion('Sin permisos: el ítem de bodega no pertenece a la faena de la OT')
}

// Solicitud a bodega — sin descontar stock, queda pendiente
export async function solicitarRepuesto(data: {
  otId: string
  descripcion: string
  cantidad: number
  unidad: string
  itemBodegaId?: string
}) {
  const sesion = await requireSesion()
  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: data.otId }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, ot.faenaId)
  if (data.itemBodegaId) await requireItemDeFaena(data.itemBodegaId, ot.faenaId)

  await prisma.$transaction([
    prisma.repuestoOT.create({
      data: {
        otId: data.otId,
        faenaId: ot.faenaId,
        descripcion: data.descripcion,
        cantidad: data.cantidad,
        unidad: data.unidad,
        precioUnit: 0,
        total: 0,
        estadoSolicitud: 'SOLICITADO',
        registradoById: sesion.userId,
        itemBodegaId: data.itemBodegaId ?? null,
      },
    }),
    prisma.bitacoraOT.create({
      data: {
        otId: data.otId,
        descripcion: `Solicitud de repuesto: ${data.descripcion} × ${data.cantidad} ${data.unidad}`,
        setEspera: true,
        usuarioId: sesion.userId,
      },
    }),
    prisma.ordenTrabajo.update({
      where: { id: data.otId },
      data: { enEsperaRepuesto: true },
    }),
  ])

  revalidatePath(`/ot/${data.otId}`)
  revalidatePath('/bodega')
}

// Entrega desde bodega — descuenta stock inmediatamente
export async function agregarRepuesto(data: {
  otId: string
  descripcion: string
  cantidad: number
  unidad: string
  precioUnit: number
  itemBodegaId?: string
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_ENTREGA)
  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: data.otId }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, ot.faenaId)

  const total = data.cantidad * data.precioUnit

  if (data.itemBodegaId) {
    const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemBodegaId } })
    requireAlcanceFaena(sesion, item.faenaId)
    await requireItemDeFaena(data.itemBodegaId, ot.faenaId)
    const stockAntes = Number(item.stockActual)
    const stockDespues = stockAntes - data.cantidad

    await prisma.$transaction([
      prisma.repuestoOT.create({
        data: {
          otId: data.otId,
          faenaId: ot.faenaId,
          descripcion: data.descripcion,
          cantidad: data.cantidad,
          unidad: data.unidad,
          precioUnit: data.precioUnit,
          total,
          estadoSolicitud: 'ENTREGADO',
          registradoById: sesion.userId,
          itemBodegaId: data.itemBodegaId,
        },
      }),
      prisma.itemBodega.update({
        where: { id: data.itemBodegaId },
        data: { stockActual: stockDespues },
      }),
      prisma.movimientoBodega.create({
        data: {
          itemId: data.itemBodegaId,
          faenaId: ot.faenaId,
          tipo: 'SALIDA',
          cantidad: data.cantidad,
          stockAntes,
          stockDespues,
          otId: data.otId,
          usuarioId: sesion.userId,
          observacion: 'Entrega a OT',
        },
      }),
      prisma.bitacoraOT.create({
        data: {
          otId: data.otId,
          descripcion: `Repuesto entregado desde bodega: ${data.descripcion} × ${data.cantidad} ${data.unidad}`,
          usuarioId: sesion.userId,
        },
      }),
    ])
  } else {
    // Compra externa
    await prisma.$transaction([
      prisma.repuestoOT.create({
        data: {
          otId: data.otId,
          faenaId: ot.faenaId,
          descripcion: data.descripcion,
          cantidad: data.cantidad,
          unidad: data.unidad,
          precioUnit: data.precioUnit,
          total,
          estadoSolicitud: 'EXTERNO',
          registradoById: sesion.userId,
        },
      }),
      prisma.bitacoraOT.create({
        data: {
          otId: data.otId,
          descripcion: `Compra externa registrada: ${data.descripcion} × ${data.cantidad} ${data.unidad}`,
          usuarioId: sesion.userId,
        },
      }),
    ])
  }

  revalidatePath(`/ot/${data.otId}`)
  revalidatePath('/bodega')
}

// Jefe/Planificador autoriza una solicitud de repuesto
export async function autorizarSolicitud(repuestoId: string, otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_AUTORIZAR_REPUESTO)

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
  requireAlcanceFaena(sesion, repuesto.faenaId)
  if (repuesto.estadoSolicitud !== 'SOLICITADO') throw new Error('Solo se pueden autorizar solicitudes pendientes')

  await prisma.$transaction([
    prisma.repuestoOT.update({
      where: { id: repuestoId },
      data: { estadoSolicitud: 'AUTORIZADO' },
    }),
    prisma.bitacoraOT.create({
      data: {
        otId,
        descripcion: `Repuesto autorizado: ${repuesto.descripcion} × ${repuesto.cantidad} ${repuesto.unidad}`,
        usuarioId: sesion.userId,
      },
    }),
  ])

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

// Jefe/Planificador rechaza una solicitud de repuesto
export async function rechazarSolicitud(repuestoId: string, otId: string, motivo?: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_AUTORIZAR_REPUESTO)

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
  requireAlcanceFaena(sesion, repuesto.faenaId)
  if (repuesto.estadoSolicitud !== 'SOLICITADO') throw new Error('Solo se pueden rechazar solicitudes pendientes')

  await prisma.$transaction([
    prisma.repuestoOT.update({
      where: { id: repuestoId },
      data: { estadoSolicitud: 'RECHAZADO' },
    }),
    prisma.bitacoraOT.create({
      data: {
        otId,
        descripcion: `Repuesto rechazado: ${repuesto.descripcion}${motivo ? ` — ${motivo}` : ''}`,
        usuarioId: sesion.userId,
      },
    }),
  ])

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

// Bodega deriva a Compras por falta de stock
export async function derivarACompras(repuestoId: string, otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_ENTREGA)

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
  requireAlcanceFaena(sesion, repuesto.faenaId)
  if (repuesto.estadoSolicitud !== 'AUTORIZADO') throw new Error('Solo se pueden derivar solicitudes autorizadas')

  await prisma.$transaction([
    prisma.repuestoOT.update({
      where: { id: repuestoId },
      data: { estadoSolicitud: 'EN_COMPRAS' },
    }),
    prisma.bitacoraOT.create({
      data: {
        otId,
        descripcion: `Sin stock en bodega — derivado a Compras: ${repuesto.descripcion} × ${repuesto.cantidad} ${repuesto.unidad}`,
        usuarioId: sesion.userId,
      },
    }),
  ])

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

// Bodega recibe el stock de Compras — vuelve a AUTORIZADO para ser entregado
export async function recibirDeCompras(repuestoId: string, otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_RECEPCION_COMPRAS)

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
  requireAlcanceFaena(sesion, repuesto.faenaId)
  if (repuesto.estadoSolicitud !== 'EN_COMPRAS') throw new Error('Solo aplica a ítems en compras')

  await prisma.$transaction([
    prisma.repuestoOT.update({
      where: { id: repuestoId },
      data: { estadoSolicitud: 'AUTORIZADO' },
    }),
    prisma.bitacoraOT.create({
      data: {
        otId,
        descripcion: `Stock recibido desde Compras — listo para entregar: ${repuesto.descripcion} × ${repuesto.cantidad} ${repuesto.unidad}`,
        usuarioId: sesion.userId,
      },
    }),
  ])

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

// Bodega entrega una solicitud autorizada (total o parcial)
export async function entregarSolicitud(repuestoId: string, otId: string, data: {
  precioUnit: number
  cantidadEntregada?: number
  itemBodegaId?: string
  destinoResto?: 'BODEGA_CENTRAL' | 'COMPRAS'
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_ENTREGA)

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
  requireAlcanceFaena(sesion, repuesto.faenaId)
  if (repuesto.estadoSolicitud !== 'AUTORIZADO') throw new Error('Solo se pueden entregar solicitudes autorizadas')

  const cantSolicitada = Number(repuesto.cantidad)
  const cantEntregada = data.cantidadEntregada ?? cantSolicitada
  const cantResto = Math.max(0, cantSolicitada - cantEntregada)
  const esParcia = cantResto > 0

  const total = cantEntregada * data.precioUnit
  const bodegaId = data.itemBodegaId ?? repuesto.itemBodegaId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [
    prisma.repuestoOT.update({
      where: { id: repuestoId },
      data: {
        estadoSolicitud: 'ENTREGADO',
        cantidad: cantEntregada,
        precioUnit: data.precioUnit,
        total,
        itemBodegaId: bodegaId ?? null,
      },
    }),
    prisma.bitacoraOT.create({
      data: {
        otId,
        descripcion: esParcia
          ? `Bodega entregó parcialmente: ${repuesto.descripcion} × ${cantEntregada} ${repuesto.unidad} (quedan ${cantResto} pendientes → ${data.destinoResto === 'COMPRAS' ? 'Compras' : 'Bodega central'})`
          : `Bodega entregó: ${repuesto.descripcion} × ${cantEntregada} ${repuesto.unidad}`,
        usuarioId: sesion.userId,
      },
    }),
  ]

  // Descontar stock si viene de bodega
  if (bodegaId) {
    const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: bodegaId } })
    requireAlcanceFaena(sesion, item.faenaId)
    await requireItemDeFaena(bodegaId, repuesto.faenaId)
    const stockAntes = Number(item.stockActual)
    const stockDespues = stockAntes - cantEntregada
    ops.push(
      prisma.itemBodega.update({ where: { id: bodegaId }, data: { stockActual: stockDespues } }),
      prisma.movimientoBodega.create({
        data: {
          itemId: bodegaId,
          faenaId: repuesto.faenaId,
          tipo: 'SALIDA',
          cantidad: cantEntregada,
          stockAntes,
          stockDespues,
          otId,
          usuarioId: sesion.userId,
          observacion: esParcia ? `Entrega parcial OT (quedan ${cantResto})` : 'Entrega de solicitud OT',
        },
      })
    )
  }

  // Si es entrega parcial, crear nuevo registro SOLICITADO por el resto
  if (esParcia) {
    const notaDestino = data.destinoResto === 'COMPRAS'
      ? ' [Solicitar a Compras]'
      : ' [Solicitar a Bodega Central]'
    ops.push(
      prisma.repuestoOT.create({
        data: {
          otId,
          faenaId: repuesto.faenaId,
          descripcion: repuesto.descripcion + notaDestino,
          cantidad: cantResto,
          unidad: repuesto.unidad,
          estadoSolicitud: 'SOLICITADO',
        },
      })
    )
  }

  await prisma.$transaction(ops)
  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

export async function eliminarRepuesto(id: string, otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_AUTORIZAR_REPUESTO)

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id } })
  requireAlcanceFaena(sesion, repuesto.faenaId)

  // Solo devolver stock si fue entregado desde bodega
  if (repuesto.itemBodegaId && repuesto.estadoSolicitud === 'ENTREGADO') {
    const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: repuesto.itemBodegaId } })
    const stockAntes = Number(item.stockActual)
    const stockDespues = stockAntes + Number(repuesto.cantidad)

    await prisma.$transaction([
      prisma.repuestoOT.delete({ where: { id } }),
      prisma.itemBodega.update({
        where: { id: repuesto.itemBodegaId },
        data: { stockActual: stockDespues },
      }),
      prisma.movimientoBodega.create({
        data: {
          itemId: repuesto.itemBodegaId,
          faenaId: repuesto.faenaId,
          tipo: 'ENTRADA',
          cantidad: Number(repuesto.cantidad),
          stockAntes,
          stockDespues,
          otId,
          usuarioId: sesion.userId,
          observacion: 'Devolución por eliminación en OT',
        },
      }),
    ])
  } else {
    await prisma.repuestoOT.delete({ where: { id } })
  }

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}
