import type { Prisma } from '@prisma/client'

// Consume lotes FIFO (más antiguos primero) hasta cubrir `cantidad`.
// Debe llamarse dentro de una transacción. Lanza error si no hay saldo.
export async function consumirFIFO(tx: Prisma.TransactionClient, itemId: string, cantidad: number) {
  // Bloquea los lotes del ítem hasta el fin de la transacción: dos salidas simultáneas del mismo ítem se ejecutan una tras otra
  // (sin esto ambas leen el mismo saldo y una descuenta de menos).
  await tx.$queryRaw`SELECT id FROM lotes_bodega WHERE item_id = ${itemId} FOR UPDATE`
  const lotes = await tx.loteBodega.findMany({
    where: { itemId, cantidadSaldo: { gt: 0 } },
    orderBy: { fechaRecepcion: 'asc' },
  })

  let restante = cantidad
  const consumos: { loteId: string; cantidad: number; costoUnitario: number }[] = []

  for (const lote of lotes) {
    if (restante <= 0) break
    const saldo = Number(lote.cantidadSaldo)
    const tomar = Math.min(saldo, restante)
    consumos.push({ loteId: lote.id, cantidad: tomar, costoUnitario: Number(lote.costoUnitario) })
    await tx.loteBodega.update({
      where: { id: lote.id },
      data: { cantidadSaldo: saldo - tomar },
    })
    restante -= tomar
  }

  if (restante > 0.0001) {
    throw new Error(`Stock insuficiente en lotes: faltan ${restante.toFixed(2)} unidades por cubrir`)
  }

  return consumos
}
