import type { Prisma } from '@prisma/client'
import { consumirFIFO } from './fifo'

// Movimientos de stock reutilizables: TODOS deben llamarse dentro de una transacción
// (`prisma.$transaction(async tx => ...)`) para que lote, stock, movimiento y consumo
// se confirmen o se deshagan juntos.

interface Base { itemId: string; faenaId: string; cantidad: number; usuarioId: string; otId?: string | null; observacion?: string }

/**
 * Salida FIFO: descuenta stock de forma atómica (la condición va dentro del UPDATE, así
 * dos salidas simultáneas no pueden dejar el stock negativo) y consume los lotes más
 * antiguos. Devuelve el costo real FIFO de lo entregado.
 */
export async function salidaStockFIFO(tx: Prisma.TransactionClient, p: Base) {
  if (!(p.cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero')
  const r = await tx.itemBodega.updateMany({
    where: { id: p.itemId, faenaId: p.faenaId, stockActual: { gte: p.cantidad } },
    data: { stockActual: { decrement: p.cantidad } },
  })
  if (r.count === 0) throw new Error('Stock insuficiente')
  const item = await tx.itemBodega.findUniqueOrThrow({ where: { id: p.itemId }, select: { stockActual: true } })
  const stockDespues = Number(item.stockActual)
  const stockAntes = stockDespues + p.cantidad

  const mov = await tx.movimientoBodega.create({
    data: { itemId: p.itemId, faenaId: p.faenaId, tipo: 'SALIDA', cantidad: p.cantidad, stockAntes, stockDespues, otId: p.otId ?? null, usuarioId: p.usuarioId, observacion: p.observacion },
  })
  const consumos = await consumirFIFO(tx, p.itemId, p.cantidad)
  for (const c of consumos) {
    await tx.consumoLoteBodega.create({ data: { loteId: c.loteId, movimientoId: mov.id, cantidad: c.cantidad, costoUnitario: c.costoUnitario } })
  }
  const costoTotal = consumos.reduce((a, c) => a + c.cantidad * c.costoUnitario, 0)
  return { movimientoId: mov.id, stockAntes, stockDespues, costoTotal, costoUnitario: costoTotal / p.cantidad }
}

/** Entrada con lote nuevo (compras, devoluciones). Mantiene lote, consumo de trazabilidad y stock alineados. */
export async function entradaStockConLote(tx: Prisma.TransactionClient, p: Base & { costoUnitario: number; documento?: string | null }) {
  if (!(p.cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero')
  const item = await tx.itemBodega.update({ where: { id: p.itemId }, data: { stockActual: { increment: p.cantidad } }, select: { stockActual: true } })
  const stockDespues = Number(item.stockActual)
  const stockAntes = stockDespues - p.cantidad
  const mov = await tx.movimientoBodega.create({
    data: { itemId: p.itemId, faenaId: p.faenaId, tipo: 'ENTRADA', cantidad: p.cantidad, stockAntes, stockDespues, otId: p.otId ?? null, usuarioId: p.usuarioId, observacion: p.observacion },
  })
  const lote = await tx.loteBodega.create({
    data: { itemId: p.itemId, cantidad: p.cantidad, cantidadSaldo: p.cantidad, costoUnitario: p.costoUnitario, documento: p.documento ?? null },
  })
  await tx.consumoLoteBodega.create({ data: { loteId: lote.id, movimientoId: mov.id, cantidad: p.cantidad, costoUnitario: p.costoUnitario } })
  return { movimientoId: mov.id, stockAntes, stockDespues }
}

/**
 * Ajuste manual a un valor absoluto (ya APROBADO por el nivel central). Los lotes se ajustan por la diferencia
 * para que sigan sumando el stock: si baja consume FIFO; si sube crea un lote al precio de referencia.
 */
export async function ajusteStockConLotes(tx: Prisma.TransactionClient, p: { itemId: string; faenaId: string; cantidadNueva: number; usuarioId: string; observacion?: string }) {
  if (!(p.cantidadNueva >= 0)) throw new Error('La cantidad nueva no puede ser negativa')
  await tx.$queryRaw`SELECT id FROM items_bodega WHERE id = ${p.itemId} FOR UPDATE` // serializa con otras salidas/entradas del ítem
  const item = await tx.itemBodega.findUniqueOrThrow({ where: { id: p.itemId }, select: { stockActual: true, precioRef: true, faenaId: true } })
  if (item.faenaId !== p.faenaId) throw new Error('El ítem no pertenece a la faena')
  const antes = Number(item.stockActual), diff = p.cantidadNueva - antes
  const mov = await tx.movimientoBodega.create({ data: { itemId: p.itemId, faenaId: p.faenaId, tipo: 'AJUSTE', cantidad: p.cantidadNueva, stockAntes: antes, stockDespues: p.cantidadNueva, usuarioId: p.usuarioId, observacion: p.observacion } })
  if (diff < 0) {
    for (const c of await consumirFIFO(tx, p.itemId, -diff)) await tx.consumoLoteBodega.create({ data: { loteId: c.loteId, movimientoId: mov.id, cantidad: c.cantidad, costoUnitario: c.costoUnitario } })
  } else if (diff > 0) {
    const lote = await tx.loteBodega.create({ data: { itemId: p.itemId, cantidad: diff, cantidadSaldo: diff, costoUnitario: Number(item.precioRef), documento: 'AJUSTE' } })
    await tx.consumoLoteBodega.create({ data: { loteId: lote.id, movimientoId: mov.id, cantidad: diff, costoUnitario: Number(item.precioRef) } })
  }
  await tx.itemBodega.update({ where: { id: p.itemId }, data: { stockActual: p.cantidadNueva } })
  return { stockAntes: antes, stockDespues: p.cantidadNueva }
}
