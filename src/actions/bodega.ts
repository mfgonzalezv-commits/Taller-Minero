'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function getItemsBodega() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.itemBodega.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    orderBy: { descripcion: 'asc' },
  })
}

export async function crearItem(data: {
  codigo: string
  descripcion: string
  unidad: string
  stockActual: number
  stockMinimo: number
  precioRef: number
  categoria?: string
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const item = await prisma.itemBodega.create({
    data: { ...data, faenaId: session.user.faenaId },
  })

  revalidatePath('/bodega')
  return item
}

export async function editarItem(id: string, data: {
  codigo: string
  descripcion: string
  unidad: string
  stockMinimo: number
  precioRef: number
  categoria?: string
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.itemBodega.update({
    where: { id, faenaId: session.user.faenaId },
    data: {
      codigo: data.codigo,
      descripcion: data.descripcion,
      unidad: data.unidad,
      stockMinimo: data.stockMinimo,
      precioRef: data.precioRef,
      categoria: data.categoria || null,
    },
  })

  revalidatePath('/bodega')
}

export async function registrarMovimiento(data: {
  itemId: string
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE'
  cantidad: number
  otId?: string
  observacion?: string
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemId } })
  const stockAntes = Number(item.stockActual)
  const stockDespues =
    data.tipo === 'ENTRADA'
      ? stockAntes + data.cantidad
      : data.tipo === 'SALIDA'
      ? stockAntes - data.cantidad
      : data.cantidad // AJUSTE = valor directo

  if (stockDespues < 0) throw new Error('Stock insuficiente')

  await prisma.$transaction([
    prisma.movimientoBodega.create({
      data: {
        itemId: data.itemId,
        faenaId: session.user.faenaId,
        tipo: data.tipo,
        cantidad: data.cantidad,
        stockAntes,
        stockDespues,
        otId: data.otId,
        usuarioId: session.user.id,
        observacion: data.observacion,
      },
    }),
    prisma.itemBodega.update({
      where: { id: data.itemId },
      data: { stockActual: stockDespues },
    }),
  ])

  revalidatePath('/bodega')
  revalidatePath(`/ot/${data.otId}`)
}
