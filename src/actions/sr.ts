'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { EstadoSR } from '@prisma/client'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, auditar, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_BITACORA, ROLES_GESTION_OT } from '@/lib/permisos-roles'
import type { Rol } from '@/lib/roles'

const ROLES_CREAR_SR: Rol[] = [...ROLES_BITACORA, 'BODEGA']
const ROLES_GESTIONAR_SR: Rol[] = [...ROLES_GESTION_OT, 'BODEGA', 'COMPRAS']
import { salidaStockFIFO } from '@/lib/stock'
import { puedeTransicionarSR } from '@/lib/maquina-sr'
import { LIMITE_COMPRA_DIRECTA_FAENA, VENTANA_FRACCIONAMIENTO_HORAS, requiereAprobacionCentral, requiereAprobacionPorAcumulado, validarRegularizacion } from '@/lib/compra-directa'
import { ROLES_APROBAR_COMPRA_CENTRAL, ROLES_COMPRAR, ROLES_REGULARIZAR_COMPRA } from '@/lib/permisos-roles'
import { encolarCorreo } from '@/lib/correo'

export async function crearSR(otId: string, data: {
  items: { descripcion: string; cantidad: number; unidad: string; itemBodegaId?: string; precioEstimado?: number }[]
  urgente: boolean
  observacion?: string
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_CREAR_SR)
  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, ot.faenaId)
  const idsItems = data.items.map(i => i.itemBodegaId).filter((x): x is string => !!x)
  if (idsItems.length) {
    const propios = await prisma.itemBodega.count({ where: { id: { in: idsItems }, faenaId: ot.faenaId } })
    if (propios !== new Set(idsItems).size) throw new ErrorAutorizacion('Sin permisos: algún ítem de bodega no pertenece a la faena de la OT')
  }

  const sr = await prisma.solicitudRepuesto.create({
    data: {
      otId,
      faenaId: ot.faenaId,
      urgente: data.urgente,
      observacion: data.observacion || null,
      creadoPorId: sesion.userId,
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
          usuarioId: sesion.userId,
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
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_GESTIONAR_SR)

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({
    where: { id: srId },
    include: { items: true },
  })
  requireAlcanceFaena(sesion, sr.faenaId)
  const userId = sesion.userId

  // Idempotente: repetir el mismo cambio (doble clic) no vuelve a registrar ni a descontar nada.
  if (sr.estado === nuevoEstado) return
  if (!puedeTransicionarSR(sr.estado, nuevoEstado)) throw new Error(`Transición no permitida: ${sr.estado} → ${nuevoEstado}`)

  const aplicado = await prisma.$transaction(async (tx) => {
    // Candado: solo una ejecución pasa del estado leído al nuevo. Si otra petición ya lo cambió, esta no hace nada.
    const cambio = await tx.solicitudRepuesto.updateMany({
      where: { id: srId, estado: sr.estado },
      data: {
        estado: nuevoEstado,
        gestionadoPorId: userId,
        ...(data?.fechaEstimadaLlegada ? { fechaEstimadaLlegada: new Date(data.fechaEstimadaLlegada) } : {}),
      },
    })
    if (cambio.count === 0) return false

    await tx.historialSR.create({
      data: { srId, estadoAnterior: sr.estado, estadoNuevo: nuevoEstado, observacion: data?.observacion || null, usuarioId: userId },
    })

    // Al entregar: el descuento FIFO ocurre UNA sola vez y en esta misma transacción (si falta stock, todo se revierte).
    if (nuevoEstado === 'ENTREGADA') {
      for (const item of sr.items) {
        if (item.itemBodegaId) {
          const bodegaItem = await tx.itemBodega.findUniqueOrThrow({ where: { id: item.itemBodegaId } })
          if (bodegaItem.faenaId !== sr.faenaId) throw new ErrorAutorizacion('Sin permisos: un ítem de la SR pertenece a otra faena')
          const salida = await salidaStockFIFO(tx, {
            itemId: item.itemBodegaId, faenaId: sr.faenaId, cantidad: Number(item.cantidad), usuarioId: userId, otId: sr.otId,
            observacion: `SR-${String(sr.numeroSr).padStart(4, '0')} entregada`,
          })
          await tx.repuestoOT.create({
            data: {
              otId: sr.otId, faenaId: sr.faenaId, descripcion: item.descripcion, cantidad: item.cantidad, unidad: item.unidad,
              precioUnit: salida.costoUnitario, total: salida.costoTotal, // costo real FIFO
              estadoSolicitud: 'ENTREGADO', itemBodegaId: item.itemBodegaId, registradoById: userId,
            },
          })
        } else {
          // Item sin bodega = externo
          await tx.repuestoOT.create({
            data: {
              otId: sr.otId, faenaId: sr.faenaId, descripcion: item.descripcion, cantidad: item.cantidad, unidad: item.unidad,
              precioUnit: item.precioEstimado ?? 0, total: Number(item.cantidad) * Number(item.precioEstimado ?? 0),
              estadoSolicitud: 'EXTERNO', registradoById: userId,
            },
          })
        }
      }

      // Verificar si quedan otras SRs pendientes en la OT
      const srsPendientes = await tx.solicitudRepuesto.count({
        where: { otId: sr.otId, estado: { notIn: ['ENTREGADA', 'RECHAZADA'] }, id: { not: srId } },
      })
      if (srsPendientes === 0) {
        await tx.ordenTrabajo.update({ where: { id: sr.otId }, data: { enEsperaRepuesto: false, estado: 'LISTO_PARA_REPARAR' } })
      }

      // Entrada en bitácora registrando la entrega
      const srNumero = `SR-${String(sr.numeroSr).padStart(4, '0')}`
      const itemsDesc = sr.items.map(i => `${i.descripcion} (${i.cantidad} ${i.unidad})`).join(', ')
      await tx.bitacoraOT.create({
        data: {
          otId: sr.otId,
          descripcion: srsPendientes === 0
            ? `Repuestos entregados (${srNumero}): ${itemsDesc}. Sin solicitudes pendientes.`
            : `Repuestos entregados (${srNumero}): ${itemsDesc}. Quedan ${srsPendientes} solicitud(es) pendiente(s).`,
          tipoIntervencion: 'SOLICITUD_REPUESTO',
          setEspera: srsPendientes > 0,
          usuarioId: userId,
        },
      })
    }
    return true
  }, { timeout: 20_000, maxWait: 10_000 })

  if (!aplicado) {
    const actual = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId }, select: { estado: true } })
    if (actual.estado === nuevoEstado) return // otra petición idéntica ya lo hizo
    throw new Error('La solicitud cambió de estado mientras se procesaba; recarga e intenta de nuevo')
  }

  // Correo formal a Bodega Central / Adquisiciones — quedan por ahora en
  // bandeja de salida (sin proveedor de correo configurado).
  if (nuevoEstado === 'EN_BODEGA_CENTRAL' || nuevoEstado === 'EN_ADQUISICIONES') {
    const srNumero = `SR-${String(sr.numeroSr).padStart(4, '0')}`
    const destino = nuevoEstado === 'EN_BODEGA_CENTRAL' ? 'Bodega Central' : 'Adquisiciones Central'
    const itemsDesc = sr.items.map(i => `- ${i.descripcion} × ${i.cantidad} ${i.unidad}`).join('\n')
    await encolarCorreo({
      faenaId: sr.faenaId,
      tipo: 'SOLICITUD_REPUESTO',
      entidadId: srId,
      destinatarios: [],
      asunto: `${srNumero} — Solicitud de repuesto${sr.urgente ? ' (URGENTE)' : ''}`,
      cuerpo: `Solicitud ${srNumero} para ${destino}.\n\nÍtems:\n${itemsDesc}\n\n${sr.observacion ?? ''}`,
    })
  }

  revalidatePath(`/ot/${sr.otId}`)
  revalidatePath('/solicitudes-repuesto')
}

// Compra directa/urgente autorizada por el jefe de taller, fuera del flujo
// normal — debe regularizarse después (Compras completa cotizaciones/orden).
async function montoEstimadoSR(srId: string, cliente: Pick<typeof prisma, 'itemSolicitudRepuesto'> = prisma): Promise<number> {
  const items = await cliente.itemSolicitudRepuesto.findMany({ where: { srId }, select: { cantidad: true, precioEstimado: true } })
  return items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precioEstimado ?? 0), 0)
}

// Otras compras directas de la MISMA OT creadas dentro de las 24 h de esta: son la misma necesidad (contra el fraccionamiento).
// Cada una aporta su monto regularizado o, si aún no, el mayor entre lo solicitado y lo estimado en sus ítems.
type Cliente = Pick<typeof prisma, 'solicitudRepuesto' | 'itemSolicitudRepuesto'>
async function otrasComprasMismaNecesidad(cliente: Cliente, sr: { id: string; otId: string; createdAt: Date }) {
  const ventana = VENTANA_FRACCIONAMIENTO_HORAS * 3_600_000
  const otras = await cliente.solicitudRepuesto.findMany({
    where: { otId: sr.otId, esCompraDirecta: true, id: { not: sr.id }, createdAt: { gte: new Date(sr.createdAt.getTime() - ventana), lte: new Date(sr.createdAt.getTime() + ventana) } },
    select: { id: true, numeroSr: true, regularizada: true, montoCompraDirecta: true, montoSolicitado: true },
  })
  const out: { id: string; numeroSr: number; monto: number }[] = []
  for (const o of otras) out.push({ id: o.id, numeroSr: o.numeroSr, monto: o.regularizada && o.montoCompraDirecta != null ? Number(o.montoCompraDirecta) : Math.max(Number(o.montoSolicitado ?? 0), await montoEstimadoSR(o.id, cliente)) })
  return out
}

export async function marcarCompraDirecta(srId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_COMPRAR)
  if (!motivo?.trim()) throw new Error('Debe justificar la compra directa')

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, sr.faenaId)
  if (sr.esCompraDirecta) return // idempotente: ya estaba marcada

  // Se permite sin cotizaciones previas solo por emergencia; el respaldo se exige al regularizar.
  const r = await prisma.solicitudRepuesto.updateMany({
    where: { id: srId, esCompraDirecta: false },
    data: { esCompraDirecta: true, motivoCompraDirecta: motivo.trim() },
  })
  if (r.count === 0) return

  await auditar({
    faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId,
    accion: 'MARCAR_COMPRA_DIRECTA', usuarioId: sesion.userId, motivo: motivo.trim(),
  })
  // Coincidencia sospechosa: otras compras directas de la misma OT en 24 h. No se bloquea (pueden ser independientes), se deja constancia y alerta.
  const otras = await otrasComprasMismaNecesidad(prisma, sr)
  if (otras.length > 0) {
    await auditar({ faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId, accion: 'COMPRAS_MISMA_NECESIDAD', usuarioId: sesion.userId, valorNuevo: { otrasSR: otras.map(o => `SR-${String(o.numeroSr).padStart(4, '0')}`), acumuladoOtras: otras.reduce((a, o) => a + o.monto, 0) } })
  }

  revalidatePath('/solicitudes-repuesto')
}

// Desde el límite de faena ($250.000 total final, IVA incluido) la compra necesita aprobación del Jefe de Taller
// Central. El límite se mide sobre el TOTAL ACUMULADO de la necesidad (misma OT, 24 h): dividir la compra no lo evita.
export async function solicitarAprobacionCompra(srId: string, monto: number) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_COMPRAR)

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, sr.faenaId)
  if (!sr.esCompraDirecta) throw new Error('Esta solicitud no es una compra directa')
  if (!(monto > 0) || !Number.isFinite(monto)) throw new Error('El monto no es válido')
  // El tope que se aprobará no puede quedar bajo lo estimado en los ítems de la SR: se usa el mayor.
  const tope = Math.max(monto, await montoEstimadoSR(srId))
  const otras = await otrasComprasMismaNecesidad(prisma, sr)
  if (!requiereAprobacionPorAcumulado(tope, otras.map(o => o.monto))) throw new Error(`Una compra menor a $${LIMITE_COMPRA_DIRECTA_FAENA.toLocaleString('es-CL')} (IVA incluido, sumando las compras de la misma OT en 24 h) se realiza en la faena sin aprobación`)
  if (sr.aprobacionSolicitadaAt) return // idempotente

  const r = await prisma.solicitudRepuesto.updateMany({ where: { id: srId, aprobacionSolicitadaAt: null }, data: { aprobacionSolicitadaAt: new Date(), aprobacionSolicitadaPorId: sesion.userId, montoSolicitado: tope } })
  if (r.count === 0) return
  await auditar({ faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId, accion: 'SOLICITAR_APROBACION_COMPRA', usuarioId: sesion.userId, valorNuevo: { monto, topeSolicitado: tope, acumuladoOtras: otras.reduce((a, o) => a + o.monto, 0) } })
  revalidatePath('/solicitudes-repuesto')
}

// Aprueba EXCLUSIVAMENTE compras que alcanzan el límite (solo el Jefe de Taller Central), individualmente o por acumulado.
export async function aprobarCompraDirectaCentral(srId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_APROBAR_COMPRA_CENTRAL)

  const sr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, sr.faenaId)
  if (!sr.esCompraDirecta) throw new Error('Esta solicitud no es una compra directa')
  if (!sr.aprobacionSolicitadaAt || sr.montoSolicitado == null) throw new Error('La faena aún no solicitó la aprobación de esta compra')
  const otras = await otrasComprasMismaNecesidad(prisma, sr)
  if (!requiereAprobacionPorAcumulado(Number(sr.montoSolicitado), otras.map(o => o.monto))) throw new Error('El nivel central solo aprueba compras que alcanzan el límite de faena')
  if (sr.aprobadaCentralPorId) return // idempotente
  if (sr.aprobacionSolicitadaPorId === sesion.userId) throw new ErrorAutorizacion('Sin permisos: quien solicita la aprobación de la compra no puede aprobarla')

  // La aprobación fija el monto tope: no vale para cualquier monto posterior.
  const r = await prisma.solicitudRepuesto.updateMany({
    where: { id: srId, aprobadaCentralPorId: null },
    data: { aprobadaCentralPorId: sesion.userId, fechaAprobacionCentral: new Date(), montoCompraDirecta: sr.montoSolicitado },
  })
  if (r.count === 0) return

  await auditar({ faenaId: sr.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId, accion: 'APROBAR_COMPRA_DIRECTA_CENTRAL', usuarioId: sesion.userId, valorNuevo: { montoAprobado: Number(sr.montoSolicitado), acumuladoOtras: otras.reduce((a, o) => a + o.monto, 0) } })
  revalidatePath('/solicitudes-repuesto')
}

// Regulariza una compra directa: exige comprobante, motivo y al menos una cotización de respaldo.
// Desde el límite (por sí sola o sumada a las otras compras de la misma OT en 24 h) requiere aprobación central.
// Idempotente y a prueba de concurrencia: las regularizaciones de una misma OT se ejecutan una tras otra (candado por OT).
export async function regularizarCompraDirecta(srId: string, datos: { cotizaciones: string[]; comprobante: string; motivo: string; monto: number }) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_REGULARIZAR_COMPRA)

  const inicial = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
  requireAlcanceFaena(sesion, inicial.faenaId)
  if (!inicial.esCompraDirecta) throw new Error('Esta solicitud no es una compra directa')
  if (inicial.regularizada) return { yaRegularizada: true }
  const error = validarRegularizacion(datos)
  if (error) throw new Error(error)

  const resultado = await prisma.$transaction(async (tx) => {
    // Candado por OT: dos regularizaciones simultáneas de la misma necesidad no pueden pasar ambas bajo el límite.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${inicial.otId}))::text AS bloqueo`
    const sr = await tx.solicitudRepuesto.findUniqueOrThrow({ where: { id: srId } })
    if (sr.regularizada) return { yaRegularizada: true, acumuladoOtras: 0 }
    if (sr.aprobacionSolicitadaAt && !sr.aprobadaCentralPorId) throw new Error('Hay una solicitud de aprobación central pendiente: espera la decisión del Jefe de Taller Central antes de regularizar')
    // El monto lo informa el cliente, así que el control usa el mayor entre lo informado y lo estimado en los ítems de la SR.
    const montoControl = Math.max(datos.monto, await montoEstimadoSR(srId, tx))
    const otras = await otrasComprasMismaNecesidad(tx, sr)
    const acumuladoOtras = otras.reduce((a, o) => a + o.monto, 0)
    if (requiereAprobacionPorAcumulado(montoControl, otras.map(o => o.monto)) && !sr.aprobadaCentralPorId) {
      throw new Error(otras.length > 0 && !requiereAprobacionCentral(montoControl)
        ? `Esta compra, sumada a las otras compras directas de la misma OT en 24 h ($${acumuladoOtras.toLocaleString('es-CL')}), alcanza el límite de faena: requiere aprobación central antes de regularizarse`
        : 'La compra alcanza el límite de faena: requiere aprobación central antes de regularizarse')
    }
    if (sr.aprobadaCentralPorId && sr.montoCompraDirecta != null && datos.monto > Number(sr.montoCompraDirecta)) throw new Error('El monto supera el monto aprobado por el nivel central')

    // El UPDATE condicionado es el candado: solo una regularización se aplica.
    const r = await tx.solicitudRepuesto.updateMany({
      where: { id: srId, regularizada: false },
      data: {
        regularizada: true, regularizadaPorId: sesion.userId, fechaRegularizacion: new Date(),
        cotizaciones: datos.cotizaciones.map(c => c.trim()).filter(Boolean),
        comprobanteRegularizacion: datos.comprobante.trim(), motivoRegularizacion: datos.motivo.trim(), montoCompraDirecta: datos.monto,
      },
    })
    return { yaRegularizada: r.count === 0, acumuladoOtras }
  }, { timeout: 20_000, maxWait: 10_000 })
  if (resultado.yaRegularizada) return { yaRegularizada: true }

  await auditar({
    faenaId: inicial.faenaId, entidad: 'SolicitudRepuesto', entidadId: srId,
    accion: 'REGULARIZAR_COMPRA_DIRECTA', usuarioId: sesion.userId, motivo: datos.motivo.trim(),
    valorNuevo: { comprobante: datos.comprobante.trim(), monto: datos.monto, cotizaciones: datos.cotizaciones.length, acumuladoOtrasMismaNecesidad: resultado.acumuladoOtras },
  })

  revalidatePath('/solicitudes-repuesto')
  return { yaRegularizada: false }
}

export async function getComprasDirectasDelMes() {
  const sesion = await requireSesion()
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  return prisma.solicitudRepuesto.findMany({
    where: { faenaId: sesion.faenaId, esCompraDirecta: true, createdAt: { gte: inicioMes } },
    include: { ot: { select: { numeroOt: true } }, creadoPor: { select: { nombre: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getSRsByOT(otId: string) {
  const sesion = await requireSesion()

  return prisma.solicitudRepuesto.findMany({
    where: { otId, faenaId: sesion.faenaId },
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
  const sesion = await requireSesion()

  return prisma.solicitudRepuesto.findMany({
    where: {
      faenaId: sesion.faenaId,
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

// Bandeja de compras directas para la interfaz: la faena ve las suyas; los roles centrales, las de todas las faenas.
export async function getComprasDirectas() {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, [...new Set([...ROLES_COMPRAR, ...ROLES_REGULARIZAR_COMPRA, ...ROLES_APROBAR_COMPRA_CENTRAL, 'PLANIFICADOR_CENTRAL' as const])])
  const central = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'].includes(sesion.rol)
  const srs = await prisma.solicitudRepuesto.findMany({
    where: { ...(central ? {} : { faenaId: sesion.faenaId }), OR: [{ esCompraDirecta: true }, { estado: { in: ['ENVIADA', 'EN_BODEGA_CENTRAL', 'EN_ADQUISICIONES', 'ESPERANDO_LLEGADA'] } }] },
    include: { items: { select: { descripcion: true, cantidad: true, unidad: true, precioEstimado: true } }, ot: { select: { numeroOt: true, equipo: { select: { codigo: true } } } }, faena: { select: { codigo: true } } },
    orderBy: [{ esCompraDirecta: 'desc' }, { createdAt: 'desc' }], take: 200,
  })
  const acumuladas = await Promise.all(srs.map(s => s.esCompraDirecta ? otrasComprasMismaNecesidad(prisma, s) : Promise.resolve([])))
  return srs.map((s, idx) => ({
    id: s.id, numeroSr: s.numeroSr, estado: s.estado, faena: s.faena.codigo, ot: s.ot.numeroOt, equipo: s.ot.equipo.codigo,
    items: s.items.map(i => `${Number(i.cantidad)} ${i.unidad} ${i.descripcion}`).join(' · '),
    montoEstimado: s.items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precioEstimado ?? 0), 0),
    otrasMismaNecesidad: acumuladas[idx].reduce((a, o) => a + o.monto, 0),
    esCompraDirecta: s.esCompraDirecta, motivoCompraDirecta: s.motivoCompraDirecta,
    aprobacionSolicitada: !!s.aprobacionSolicitadaAt, montoSolicitado: s.montoSolicitado == null ? null : Number(s.montoSolicitado),
    aprobadaCentral: !!s.aprobadaCentralPorId, regularizada: s.regularizada, comprobante: s.comprobanteRegularizacion, montoFinal: s.montoCompraDirecta == null ? null : Number(s.montoCompraDirecta),
  }))
}
