'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, auditar, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_CREAR_ITEM_BODEGA, ROLES_GESTION_OT } from '@/lib/permisos-roles'
import type { Rol } from '@/lib/roles'

// Movimientos de stock: gestión de la faena y BODEGA (COMPRAS solo registra entradas).
const ROLES_MOVER_STOCK: Rol[] = [...ROLES_GESTION_OT, 'BODEGA']
import { CriticidadItemBodega } from '@prisma/client'
import { consumirFIFO } from '@/lib/fifo'
import { entradaStockConLote, salidaStockFIFO } from '@/lib/stock'

export async function getItemsBodega() {
  const sesion = await requireSesion()

  return prisma.itemBodega.findMany({
    where: { faenaId: sesion.faenaId, activo: true },
    orderBy: { descripcion: 'asc' },
  })
}

export async function crearItem(data: {
  codigo: string
  descripcion: string
  unidad: string
  stockActual: number
  stockMinimo: number
  stockMaximo?: number
  criticidad?: CriticidadItemBodega
  precioRef: number
  categoria?: string
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_CREAR_ITEM_BODEGA)

  const item = await prisma.itemBodega.create({
    data: { ...data, faenaId: sesion.faenaId },
  })

  // Stock inicial = primer lote, para que el FIFO tenga de dónde partir.
  if (data.stockActual > 0) {
    await prisma.loteBodega.create({
      data: {
        itemId: item.id,
        cantidad: data.stockActual,
        cantidadSaldo: data.stockActual,
        costoUnitario: data.precioRef,
        documento: 'Carga inicial',
      },
    })
  }

  revalidatePath('/bodega')
  return item
}

export async function editarItem(id: string, data: {
  codigo: string
  descripcion: string
  unidad: string
  stockMinimo: number
  stockMaximo?: number
  criticidad?: CriticidadItemBodega
  precioRef: number
  categoria?: string
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_CREAR_ITEM_BODEGA)

  await prisma.itemBodega.update({
    where: { id, faenaId: sesion.faenaId },
    data: {
      codigo: data.codigo,
      descripcion: data.descripcion,
      unidad: data.unidad,
      stockMinimo: data.stockMinimo,
      stockMaximo: data.stockMaximo ?? null,
      criticidad: data.criticidad ?? undefined,
      precioRef: data.precioRef,
      categoria: data.categoria || null,
    },
  })

  revalidatePath('/bodega')
}

// Consume lotes FIFO (más antiguos primero) hasta cubrir `cantidad`.
// Debe llamarse dentro de una transacción. Lanza error si no hay saldo.

export async function registrarMovimiento(data: {
  itemId: string
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE'
  cantidad: number
  costoUnitario?: number
  documento?: string
  otId?: string
  observacion?: string
}) {
  const sesion = await requireSesion()

  requireRolPermitido(sesion, data.tipo === 'ENTRADA' ? [...ROLES_MOVER_STOCK, 'COMPRAS'] : ROLES_MOVER_STOCK)

  const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemId } })
  requireAlcanceFaena(sesion, item.faenaId)
  if (data.otId) {
    const ot = await prisma.ordenTrabajo.findUnique({ where: { id: data.otId }, select: { faenaId: true } })
    if (!ot || ot.faenaId !== item.faenaId) throw new ErrorAutorizacion('Sin permisos: la OT no pertenece a la faena del ítem')
  }
  if (!(data.cantidad >= 0) || (data.tipo !== 'AJUSTE' && !(data.cantidad > 0))) throw new Error('La cantidad debe ser mayor a cero')

  // Todo en una transacción y con el stock leído/condicionado dentro de ella: dos movimientos
  // simultáneos no pisan el stock ni dejan lotes desalineados.
  const { stockAntes, stockDespues } = await prisma.$transaction(async (tx) => {
    if (data.tipo === 'SALIDA') {
      return salidaStockFIFO(tx, { itemId: data.itemId, faenaId: item.faenaId, cantidad: data.cantidad, usuarioId: sesion.userId, otId: data.otId, observacion: data.observacion })
    }
    if (data.tipo === 'ENTRADA') {
      return entradaStockConLote(tx, {
        itemId: data.itemId, faenaId: item.faenaId, cantidad: data.cantidad, usuarioId: sesion.userId, otId: data.otId, observacion: data.observacion,
        costoUnitario: data.costoUnitario ?? Number(item.precioRef), documento: data.documento,
      })
    }
    // AJUSTE = valor directo. Los lotes se ajustan por la diferencia para que sigan sumando el stock.
    const actual = await tx.itemBodega.findUniqueOrThrow({ where: { id: data.itemId }, select: { stockActual: true } })
    const antes = Number(actual.stockActual)
    const diff = data.cantidad - antes
    const mov = await tx.movimientoBodega.create({
      data: { itemId: data.itemId, faenaId: item.faenaId, tipo: 'AJUSTE', cantidad: data.cantidad, stockAntes: antes, stockDespues: data.cantidad, otId: data.otId, usuarioId: sesion.userId, observacion: data.observacion },
    })
    if (diff < 0) {
      for (const c of await consumirFIFO(tx, data.itemId, -diff)) {
        await tx.consumoLoteBodega.create({ data: { loteId: c.loteId, movimientoId: mov.id, cantidad: c.cantidad, costoUnitario: c.costoUnitario } })
      }
    } else if (diff > 0) {
      const lote = await tx.loteBodega.create({ data: { itemId: data.itemId, cantidad: diff, cantidadSaldo: diff, costoUnitario: Number(item.precioRef), documento: data.documento ?? null } })
      await tx.consumoLoteBodega.create({ data: { loteId: lote.id, movimientoId: mov.id, cantidad: diff, costoUnitario: Number(item.precioRef) } })
    }
    await tx.itemBodega.update({ where: { id: data.itemId }, data: { stockActual: data.cantidad } })
    return { stockAntes: antes, stockDespues: data.cantidad }
  })

  await auditar({
    faenaId: item.faenaId,
    entidad: 'ItemBodega',
    entidadId: data.itemId,
    accion: `MOVIMIENTO_${data.tipo}`,
    usuarioId: sesion.userId,
    valorAnterior: { stockActual: stockAntes },
    valorNuevo: { stockActual: stockDespues },
    motivo: data.observacion ?? null,
  })

  revalidatePath('/bodega')
  revalidatePath(`/ot/${data.otId}`)
}

// Transferencia trazable de stock entre faenas, antes de recurrir a compra.
// Consume FIFO en el ítem de origen y crea un lote nuevo en destino con el
// costo promedio ponderado de lo transferido.
export async function transferirStockEntreFaenas(data: {
  itemOrigenId: string
  itemDestinoId: string
  cantidad: number
  observacion?: string
}) {
  const sesion = await requireSesion()
  requireRolCompra(sesion.rol)

  const [origen, destino] = await Promise.all([
    prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemOrigenId } }),
    prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemDestinoId } }),
  ])
  if (origen.faenaId === destino.faenaId) throw new Error('Los ítems deben ser de faenas distintas')

  const stockAntesOrigen = Number(origen.stockActual)
  const stockDespuesOrigen = stockAntesOrigen - data.cantidad
  if (stockDespuesOrigen < 0) throw new Error('Stock insuficiente en la faena de origen')
  const stockAntesDestino = Number(destino.stockActual)
  const stockDespuesDestino = stockAntesDestino + data.cantidad

  await prisma.$transaction(async (tx) => {
    const consumos = await consumirFIFO(tx, data.itemOrigenId, data.cantidad)
    const costoPromedio =
      consumos.reduce((acc, c) => acc + c.cantidad * c.costoUnitario, 0) / data.cantidad

    const movSalida = await tx.movimientoBodega.create({
      data: {
        itemId: data.itemOrigenId, faenaId: origen.faenaId, tipo: 'SALIDA', cantidad: data.cantidad,
        stockAntes: stockAntesOrigen, stockDespues: stockDespuesOrigen,
        usuarioId: sesion.userId, observacion: `Transferencia a otra faena${data.observacion ? ` — ${data.observacion}` : ''}`,
      },
    })
    for (const c of consumos) {
      await tx.consumoLoteBodega.create({ data: { loteId: c.loteId, movimientoId: movSalida.id, cantidad: c.cantidad, costoUnitario: c.costoUnitario } })
    }
    await tx.itemBodega.update({ where: { id: data.itemOrigenId }, data: { stockActual: stockDespuesOrigen } })

    const loteDestino = await tx.loteBodega.create({
      data: { itemId: data.itemDestinoId, cantidad: data.cantidad, cantidadSaldo: data.cantidad, costoUnitario: costoPromedio, documento: 'Transferencia entre faenas' },
    })
    const movEntrada = await tx.movimientoBodega.create({
      data: {
        itemId: data.itemDestinoId, faenaId: destino.faenaId, tipo: 'ENTRADA', cantidad: data.cantidad,
        stockAntes: stockAntesDestino, stockDespues: stockDespuesDestino,
        usuarioId: sesion.userId, observacion: `Transferencia desde otra faena${data.observacion ? ` — ${data.observacion}` : ''}`,
      },
    })
    await tx.consumoLoteBodega.create({ data: { loteId: loteDestino.id, movimientoId: movEntrada.id, cantidad: data.cantidad, costoUnitario: costoPromedio } })
    await tx.itemBodega.update({ where: { id: data.itemDestinoId }, data: { stockActual: stockDespuesDestino } })

    await tx.transferenciaBodega.create({
      data: {
        itemOrigenId: data.itemOrigenId, itemDestinoId: data.itemDestinoId,
        faenaOrigenId: origen.faenaId, faenaDestinoId: destino.faenaId,
        cantidad: data.cantidad, usuarioId: sesion.userId, observacion: data.observacion ?? null,
      },
    })
  })

  await auditar({
    entidad: 'ItemBodega', entidadId: data.itemOrigenId, accion: 'TRANSFERIR_ENTRE_FAENAS',
    usuarioId: sesion.userId, valorNuevo: { itemDestinoId: data.itemDestinoId, cantidad: data.cantidad },
  })

  revalidatePath('/bodega')
}

function requireRolCompra(rol: string) {
  const permitidos = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'BODEGA', 'COMPRAS']
  if (!permitidos.includes(rol)) throw new Error('Sin permisos para esta acción')
}

// Items críticos/bajo stock — para alertas simultáneas a faena y central y
// para sugerir reposición.
export async function getItemsCriticos() {
  const sesion = await requireSesion()
  const items = await prisma.itemBodega.findMany({
    where: { faenaId: sesion.faenaId, activo: true },
    orderBy: { descripcion: 'asc' },
  })
  return items.filter(i => i.criticidad === 'ALTA' || Number(i.stockActual) <= Number(i.stockMinimo))
}
