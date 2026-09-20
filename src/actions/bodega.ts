'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, auditar, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_APROBAR_AJUSTE, ROLES_CREAR_ITEM_BODEGA, ROLES_GESTION_OT, ROLES_SOLICITAR_AJUSTE } from '@/lib/permisos-roles'
import type { Rol } from '@/lib/roles'

// Movimientos de stock: gestión de la faena y BODEGA (COMPRAS solo registra entradas).
const ROLES_MOVER_STOCK: Rol[] = [...ROLES_GESTION_OT, 'BODEGA']
import { CriticidadItemBodega } from '@prisma/client'
import { consumirFIFO } from '@/lib/fifo'
import { ajusteStockConLotes, entradaStockConLote, salidaStockFIFO } from '@/lib/stock'

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

  if (data.tipo === 'AJUSTE') throw new Error('Los ajustes manuales de stock se solicitan y los aprueba el Jefe de Taller Central')
  requireRolPermitido(sesion, data.tipo === 'ENTRADA' ? [...ROLES_MOVER_STOCK, 'COMPRAS'] : ROLES_MOVER_STOCK)

  const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemId } })
  requireAlcanceFaena(sesion, item.faenaId)
  if (data.otId) {
    const ot = await prisma.ordenTrabajo.findUnique({ where: { id: data.otId }, select: { faenaId: true } })
    if (!ot || ot.faenaId !== item.faenaId) throw new ErrorAutorizacion('Sin permisos: la OT no pertenece a la faena del ítem')
  }
  if (!(data.cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero')

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
    throw new Error('Los ajustes manuales de stock se solicitan y los aprueba el Jefe de Taller Central')
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

// ── Ajustes manuales de stock: se SOLICITAN en la faena (inventario físico) y los APRUEBA el Jefe de Taller Central ──
export async function solicitarAjusteStock(data: { itemId: string; cantidadNueva: number; motivo: string }) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_SOLICITAR_AJUSTE)
  if (!data.motivo?.trim()) throw new Error('Debe indicar el motivo del ajuste (por ejemplo, el resultado del inventario)')
  if (!(data.cantidadNueva >= 0) || !Number.isFinite(data.cantidadNueva)) throw new Error('La cantidad contada no es válida')

  const item = await prisma.itemBodega.findUniqueOrThrow({ where: { id: data.itemId } })
  requireAlcanceFaena(sesion, item.faenaId)
  if (item.faenaId !== sesion.faenaId && sesion.rol !== 'ADMINISTRADOR') throw new ErrorAutorizacion('Sin permisos: solo se solicitan ajustes de la propia faena')
  const pendiente = await prisma.solicitudAjusteStock.findFirst({ where: { itemId: data.itemId, estado: 'PENDIENTE' } })
  if (pendiente) throw new Error('Este ítem ya tiene una solicitud de ajuste pendiente')

  const sol = await prisma.solicitudAjusteStock.create({ data: { faenaId: item.faenaId, itemId: data.itemId, cantidadActual: item.stockActual, cantidadNueva: data.cantidadNueva, motivo: data.motivo.trim(), solicitadoPorId: sesion.userId } })
    .catch((e) => { if (e?.code === 'P2002') throw new Error('Este ítem ya tiene una solicitud de ajuste pendiente'); throw e })
  await auditar({ faenaId: item.faenaId, entidad: 'SolicitudAjusteStock', entidadId: sol.id, accion: 'SOLICITAR_AJUSTE', usuarioId: sesion.userId, valorAnterior: { stock: Number(item.stockActual) }, valorNuevo: { stock: data.cantidadNueva }, motivo: data.motivo.trim() })
  revalidatePath('/bodega')
  return sol.id
}

export async function aprobarAjusteStock(solicitudId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_APROBAR_AJUSTE)
  const sol = await prisma.solicitudAjusteStock.findUniqueOrThrow({ where: { id: solicitudId } })
  requireAlcanceFaena(sesion, sol.faenaId)
  if (sol.solicitadoPorId === sesion.userId) throw new ErrorAutorizacion('Sin permisos: quien solicita el ajuste no puede aprobarlo')
  if (sol.estado !== 'PENDIENTE') throw new Error(`La solicitud ya está ${sol.estado.toLowerCase()}`)

  // Todo o nada: la solicitud pasa a APROBADO y el ajuste (movimiento, lotes y stock) se aplica en la misma transacción.
  await prisma.$transaction(async (tx) => {
    const actual = await tx.itemBodega.findUniqueOrThrow({ where: { id: sol.itemId }, select: { stockActual: true } })
    if (Math.abs(Number(actual.stockActual) - Number(sol.cantidadActual)) > 0.005) throw new Error(`El stock cambió desde la solicitud (era ${Number(sol.cantidadActual)}, ahora ${Number(actual.stockActual)}): rechaza y solicita el ajuste de nuevo con un conteo actualizado`)
    const c = await tx.solicitudAjusteStock.updateMany({ where: { id: solicitudId, estado: 'PENDIENTE' }, data: { estado: 'APROBADO', resueltoPorId: sesion.userId, resueltoAt: new Date() } })
    if (c.count === 0) throw new Error('La solicitud ya fue resuelta')
    await ajusteStockConLotes(tx, { itemId: sol.itemId, faenaId: sol.faenaId, cantidadNueva: Number(sol.cantidadNueva), usuarioId: sesion.userId, observacion: `Ajuste aprobado: ${sol.motivo}` })
  }, { timeout: 20_000, maxWait: 10_000 })
  await auditar({ faenaId: sol.faenaId, entidad: 'SolicitudAjusteStock', entidadId: solicitudId, accion: 'APROBAR_AJUSTE', usuarioId: sesion.userId, valorNuevo: { stock: Number(sol.cantidadNueva) }, motivo: sol.motivo })
  revalidatePath('/bodega')
}

export async function rechazarAjusteStock(solicitudId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_APROBAR_AJUSTE)
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo del rechazo')
  const sol = await prisma.solicitudAjusteStock.findUniqueOrThrow({ where: { id: solicitudId } })
  requireAlcanceFaena(sesion, sol.faenaId)
  const c = await prisma.solicitudAjusteStock.updateMany({ where: { id: solicitudId, estado: 'PENDIENTE' }, data: { estado: 'RECHAZADO', resueltoPorId: sesion.userId, resueltoAt: new Date(), motivoResolucion: motivo.trim() } })
  if (c.count === 0) throw new Error('La solicitud ya fue resuelta')
  await auditar({ faenaId: sol.faenaId, entidad: 'SolicitudAjusteStock', entidadId: solicitudId, accion: 'RECHAZAR_AJUSTE', usuarioId: sesion.userId, motivo: motivo.trim() })
  revalidatePath('/bodega')
}

// Ajustes de stock para la interfaz: pendientes y últimos resueltos de la faena (los roles centrales ven todas).
export async function getAjustesStock() {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, [...new Set([...ROLES_SOLICITAR_AJUSTE, ...ROLES_APROBAR_AJUSTE, 'PLANIFICADOR_CENTRAL' as const])])
  const central = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'].includes(sesion.rol)
  const sols = await prisma.solicitudAjusteStock.findMany({ where: central ? {} : { faenaId: sesion.faenaId }, orderBy: { createdAt: 'desc' }, take: 40 })
  const items = await prisma.itemBodega.findMany({ where: { id: { in: sols.map(s => s.itemId) } }, select: { id: true, codigo: true, descripcion: true, faena: { select: { codigo: true } } } })
  const usuarios = await prisma.usuario.findMany({ where: { id: { in: sols.map(s => s.solicitadoPorId) } }, select: { id: true, nombre: true } })
  return sols.map(s => {
    const it = items.find(i => i.id === s.itemId), u = usuarios.find(x => x.id === s.solicitadoPorId)
    return { id: s.id, faena: it?.faena.codigo ?? '', item: `${it?.codigo ?? ''} ${it?.descripcion ?? ''}`.trim(), actual: Number(s.cantidadActual), nueva: Number(s.cantidadNueva), motivo: s.motivo, estado: s.estado, solicitadoPor: u?.nombre ?? '', propia: s.solicitadoPorId === sesion.userId, fecha: s.createdAt.toISOString() }
  })
}
