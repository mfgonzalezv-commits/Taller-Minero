'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// Solicitud a bodega — sin descontar stock, queda pendiente
export async function solicitarRepuesto(data: {
  otId: string
  descripcion: string
  cantidad: number
  unidad: string
  itemBodegaId?: string
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  await prisma.$transaction([
    prisma.repuestoOT.create({
      data: {
        otId: data.otId,
        faenaId: session.user.faenaId,
        descripcion: data.descripcion,
        cantidad: data.cantidad,
        unidad: data.unidad,
        precioUnit: 0,
        total: 0,
        estadoSolicitud: 'SOLICITADO',
        registradoById: session.user.id,
        itemBodegaId: data.itemBodegaId ?? null,
      },
    }),
    prisma.bitacoraOT.create({
      data: {
        otId: data.otId,
        descripcion: `Solicitud de repuesto: ${data.descripcion} × ${data.cantidad} ${data.unidad}`,
        setEspera: true,
        usuarioId: session.user.id,
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
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const total = data.cantidad * data.precioUnit

  if (data.itemBodegaId) {
    const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemBodegaId } })
    const stockAntes = Number(item.stockActual)
    const stockDespues = stockAntes - data.cantidad

    await prisma.$transaction([
      prisma.repuestoOT.create({
        data: {
          otId: data.otId,
          faenaId: session.user.faenaId,
          descripcion: data.descripcion,
          cantidad: data.cantidad,
          unidad: data.unidad,
          precioUnit: data.precioUnit,
          total,
          estadoSolicitud: 'ENTREGADO',
          registradoById: session.user.id,
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
          faenaId: session.user.faenaId,
          tipo: 'SALIDA',
          cantidad: data.cantidad,
          stockAntes,
          stockDespues,
          otId: data.otId,
          usuarioId: session.user.id,
          observacion: 'Entrega a OT',
        },
      }),
      prisma.bitacoraOT.create({
        data: {
          otId: data.otId,
          descripcion: `Repuesto entregado desde bodega: ${data.descripcion} × ${data.cantidad} ${data.unidad}`,
          usuarioId: session.user.id,
        },
      }),
    ])
  } else {
    // Compra externa
    await prisma.$transaction([
      prisma.repuestoOT.create({
        data: {
          otId: data.otId,
          faenaId: session.user.faenaId,
          descripcion: data.descripcion,
          cantidad: data.cantidad,
          unidad: data.unidad,
          precioUnit: data.precioUnit,
          total,
          estadoSolicitud: 'EXTERNO',
          registradoById: session.user.id,
        },
      }),
      prisma.bitacoraOT.create({
        data: {
          otId: data.otId,
          descripcion: `Compra externa registrada: ${data.descripcion} × ${data.cantidad} ${data.unidad}`,
          usuarioId: session.user.id,
        },
      }),
    ])
  }

  revalidatePath(`/ot/${data.otId}`)
  revalidatePath('/bodega')
}

// Jefe/Planificador autoriza una solicitud de repuesto
export async function autorizarSolicitud(repuestoId: string, otId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Sin sesión')

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
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
        usuarioId: session.user.id,
      },
    }),
  ])

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

// Jefe/Planificador rechaza una solicitud de repuesto
export async function rechazarSolicitud(repuestoId: string, otId: string, motivo?: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Sin sesión')

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
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
        usuarioId: session.user.id,
      },
    }),
  ])

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

// Bodega deriva a Compras por falta de stock
export async function derivarACompras(repuestoId: string, otId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Sin sesión')

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
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
        usuarioId: session.user.id,
      },
    }),
  ])

  revalidatePath(`/ot/${otId}`)
  revalidatePath('/bodega')
}

// Bodega recibe el stock de Compras — vuelve a AUTORIZADO para ser entregado
export async function recibirDeCompras(repuestoId: string, otId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Sin sesión')

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
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
        usuarioId: session.user.id,
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
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: repuestoId } })
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
        usuarioId: session.user.id,
      },
    }),
  ]

  // Descontar stock si viene de bodega
  if (bodegaId) {
    const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: bodegaId } })
    const stockAntes = Number(item.stockActual)
    const stockDespues = stockAntes - cantEntregada
    ops.push(
      prisma.itemBodega.update({ where: { id: bodegaId }, data: { stockActual: stockDespues } }),
      prisma.movimientoBodega.create({
        data: {
          itemId: bodegaId,
          faenaId: session.user.faenaId,
          tipo: 'SALIDA',
          cantidad: cantEntregada,
          stockAntes,
          stockDespues,
          otId,
          usuarioId: session.user.id,
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
          faenaId: session.user.faenaId,
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
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const repuesto = await prisma.repuestoOT.findUniqueOrThrow({ where: { id } })

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
          faenaId: session.user.faenaId,
          tipo: 'ENTRADA',
          cantidad: Number(repuesto.cantidad),
          stockAntes,
          stockDespues,
          otId,
          usuarioId: session.user.id,
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
