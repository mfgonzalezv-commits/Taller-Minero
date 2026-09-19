'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_AUTORIZAR_REPUESTO } from '@/lib/permisos-roles'
import type { Rol } from '@/lib/roles'
import { entradaStockConLote, salidaStockFIFO } from '@/lib/stock'

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
    const itemBodegaId = data.itemBodegaId
    await requireItemDeFaena(itemBodegaId, ot.faenaId)

    // Una sola transacción: stock, lotes FIFO, movimiento, consumo, repuesto y bitácora.
    await prisma.$transaction(async (tx) => {
      const salida = await salidaStockFIFO(tx, { itemId: itemBodegaId, faenaId: ot.faenaId, cantidad: data.cantidad, usuarioId: sesion.userId, otId: data.otId, observacion: 'Entrega a OT' })
      await tx.repuestoOT.create({
        data: {
          otId: data.otId,
          faenaId: ot.faenaId,
          descripcion: data.descripcion,
          cantidad: data.cantidad,
          unidad: data.unidad,
          precioUnit: salida.costoUnitario, // costo real FIFO, no el informado a mano
          total: salida.costoTotal,
          estadoSolicitud: 'ENTREGADO',
          registradoById: sesion.userId,
          itemBodegaId,
        },
      })
      await tx.bitacoraOT.create({
        data: {
          otId: data.otId,
          descripcion: `Repuesto entregado desde bodega: ${data.descripcion} × ${data.cantidad} ${data.unidad}`,
          usuarioId: sesion.userId,
        },
      })
    })
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
  if (!(cantEntregada > 0) || cantEntregada > cantSolicitada) throw new Error('La cantidad entregada debe ser mayor a cero y no superar lo solicitado')
  const cantResto = Math.max(0, cantSolicitada - cantEntregada)
  const esParcia = cantResto > 0
  const bodegaId = data.itemBodegaId ?? repuesto.itemBodegaId
  if (bodegaId) await requireItemDeFaena(bodegaId, repuesto.faenaId)

  // Todo o nada: si falta stock, o dos personas entregan la misma solicitud a la vez, no queda nada a medias.
  await prisma.$transaction(async (tx) => {
    // El UPDATE condicionado es el candado de idempotencia: solo una ejecución pasa de AUTORIZADO a ENTREGADO.
    const cambio = await tx.repuestoOT.updateMany({ where: { id: repuestoId, estadoSolicitud: 'AUTORIZADO' }, data: { estadoSolicitud: 'ENTREGADO' } })
    if (cambio.count === 0) throw new Error('Esta solicitud ya fue entregada o cambió de estado')

    let precioUnit = data.precioUnit
    let total = cantEntregada * data.precioUnit
    if (bodegaId) {
      const salida = await salidaStockFIFO(tx, {
        itemId: bodegaId, faenaId: repuesto.faenaId, cantidad: cantEntregada, usuarioId: sesion.userId, otId,
        observacion: esParcia ? `Entrega parcial OT (quedan ${cantResto})` : 'Entrega de solicitud OT',
      })
      precioUnit = salida.costoUnitario // costo real FIFO
      total = salida.costoTotal
    }
    await tx.repuestoOT.update({
      where: { id: repuestoId },
      data: { cantidad: cantEntregada, precioUnit, total, itemBodegaId: bodegaId ?? null },
    })
    await tx.bitacoraOT.create({
      data: {
        otId,
        descripcion: esParcia
          ? `Bodega entregó parcialmente: ${repuesto.descripcion} × ${cantEntregada} ${repuesto.unidad} (quedan ${cantResto} pendientes → ${data.destinoResto === 'COMPRAS' ? 'Compras' : 'Bodega central'})`
          : `Bodega entregó: ${repuesto.descripcion} × ${cantEntregada} ${repuesto.unidad}`,
        usuarioId: sesion.userId,
      },
    })
    if (esParcia) {
      const notaDestino = data.destinoResto === 'COMPRAS' ? ' [Solicitar a Compras]' : ' [Solicitar a Bodega Central]'
      await tx.repuestoOT.create({
        data: { otId, faenaId: repuesto.faenaId, descripcion: repuesto.descripcion + notaDestino, cantidad: cantResto, unidad: repuesto.unidad, estadoSolicitud: 'SOLICITADO' },
      })
    }
  })

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

export async function eliminarRepuesto(id: string, otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_AUTORIZAR_REPUESTO)

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id } })
  requireAlcanceFaena(sesion, repuesto.faenaId)

  await prisma.$transaction(async (tx) => {
    const borrado = await tx.repuestoOT.deleteMany({ where: { id } })
    if (borrado.count === 0) throw new Error('El repuesto ya fue eliminado')
    // Solo devolver stock si fue entregado desde bodega: vuelve como lote nuevo al costo con que salió.
    if (repuesto.itemBodegaId && repuesto.estadoSolicitud === 'ENTREGADO') {
      await entradaStockConLote(tx, {
        itemId: repuesto.itemBodegaId, faenaId: repuesto.faenaId, cantidad: Number(repuesto.cantidad),
        costoUnitario: Number(repuesto.precioUnit), usuarioId: sesion.userId, otId,
        observacion: 'Devolución por eliminación en OT',
      })
    }
  })

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}
