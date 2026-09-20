import type { Prisma, PrismaClient } from '@prisma/client'

// Crea el checklist de una OT desde su pauta y ciclo. Recibe el cliente para poder correr dentro de la transacción de crearOT.
export async function checklistDesdePautaTx(c: PrismaClient | Prisma.TransactionClient, otId: string, pautaId: string, ciclo: number) {
  const pauta = await c.pautaMantenimiento.findUnique({
    where: { id: pautaId },
    include: { items: { orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] } },
  })
  if (!pauta) throw new Error('Pauta no encontrada')

  // Solo incluir ítems que aplican en este ciclo
  const itemsAplicables = pauta.items.filter(item =>
    item.ciclosReemplazar.includes(ciclo) || item.ciclosCondicionar.includes(ciclo)
  )

  if (itemsAplicables.length === 0) {
    // Si no hay ítems para este ciclo exacto, incluir todos
    const todos = pauta.items
    await c.checklistItemOT.createMany({
      data: todos.map((item, idx) => ({
        otId,
        descripcion: item.componente,
        codigo: item.alternativo || null,
        cantidad: item.cantidad,
        unidad: item.unidad || 'un',
        obligatorio: true,
        completado: false,
        orden: idx,
      })),
    })
    return todos.length
  }

  await c.checklistItemOT.createMany({
    data: itemsAplicables.map((item, idx) => ({
      otId,
      descripcion: `${item.ciclosReemplazar.includes(ciclo) ? '🔄 ' : '🔍 '}${item.componente}`,
      codigo: item.alternativo || null,
      cantidad: item.cantidad,
      unidad: item.unidad || 'un',
      obligatorio: item.ciclosReemplazar.includes(ciclo),
      completado: false,
      orden: idx,
    })),
  })

  return itemsAplicables.length
}
