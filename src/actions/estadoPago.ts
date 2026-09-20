'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar, ErrorAutorizacion } from '@/lib/authz'
import { calcularPeriodo } from '@/lib/periodo-pago'
import { calcularLineaAsignacion, type LineaCalculada } from '@/lib/linea-estado-pago'
import { episodiosDetencionOT, ventanaEfectiva, type OtDetencion } from '@/lib/detencion-periodo'
import { detencionesYLiberaciones } from '@/lib/detencion-registro'
import { esNoOperacional } from '@/lib/estados-equipo'
import { serializar } from '@/lib/serialize'
import { admiteAjustes, admiteReemplazo, compararVersiones, puedeTransicionarEP, violaSeparacionDeFunciones, type EstadoEP } from '@/lib/estado-pago-maquina'
import { ROLES_ANULAR_EP, ROLES_DECIDIR_EP, ROLES_PREPARAR_EP } from '@/lib/permisos-roles'
import { Prisma } from '@prisma/client'

// Gerencia decide sobre los Estados de Pago de todas las faenas (no tiene alcance central general).
function requireAlcanceEP(sesion: Awaited<ReturnType<typeof requireSesion>>, faenaId: string) {
  if (sesion.rol === 'GERENCIA') return
  requireAlcanceFaena(sesion, faenaId)
}

/** Arma las líneas de arriendo del periodo (solo lectura). No incluye reparaciones, repuestos ni servicios externos. */
async function calcularLineasPeriodo(faenaId: string, inicio: Date, termino: Date): Promise<LineaCalculada[]> {
  // Asignaciones vigentes de equipos a esta faena, con tarifa/modalidad definida.
  const asignaciones = await prisma.asignacionEquipoFaena.findMany({
    where: {
      faenaId,
      tarifa: { not: null },
      modalidadArriendo: { not: null },
      fechaInicio: { lte: termino },
      OR: [{ fechaTermino: null }, { fechaTermino: { gte: inicio } }],
    },
    include: { equipo: true },
  })

  const periodo = { inicio, termino }
  const lineas: LineaCalculada[] = []

  for (const a of asignaciones) {
    const modalidad = a.modalidadArriendo!
    const v = ventanaEfectiva(periodo, a)

    // Solo datos del mismo equipo Y de la misma faena. La detención de cada OT termina en la LIBERACIÓN operacional del equipo
    // (no cuando el mecánico termina): incluye espera de validación y retrabajo, y una reapertura abre otro episodio.
    const [ots, lecturas, { detenciones, liberaciones }] = v
      ? await Promise.all([
          prisma.ordenTrabajo.findMany({
            where: { equipoId: a.equipoId, faenaId, estado: { not: 'ANULADA' }, fechaCreacion: { lte: v.termino } },
            select: { id: true, equipoId: true, faenaId: true, estado: true, fechaCreacion: true, fechaTerminoTrabajo: true, fechaCierre: true, historial: { select: { estadoAnterior: true, estadoNuevo: true, fechaCambio: true } } },
          }),
          modalidad === 'HORA'
            ? prisma.horometroKm.findMany({
                where: { equipoId: a.equipoId, faenaId, fechaRegistro: { gte: v.inicio, lte: v.termino }, horometro: { not: null }, OR: [{ validado: null }, { validado: true }] },
                orderBy: { fechaRegistro: 'asc' },
                select: { equipoId: true, faenaId: true, fechaRegistro: true, horometro: true },
              })
            : Promise.resolve([]),
          detencionesYLiberaciones(prisma, a.equipoId, faenaId, v),
        ])
      : [[], [], { detenciones: [], liberaciones: [] }]
    // La OT "última" se decide por (fecha de creación, id) y un episodio solo queda abierto si el periodo aún está en curso:
    // reprocesar un periodo pasado no debe extender detenciones por el estado de HOY del equipo.
    const ultimaOt = ots.reduce<{ id: string; f: Date } | null>((m, o) => (m === null || o.fechaCreacion > m.f || (o.fechaCreacion.getTime() === m.f.getTime() && o.id > m.id) ? { id: o.id, f: o.fechaCreacion } : m), null)
    const detenidoActual = esNoOperacional(a.equipo.estado) && termino.getTime() >= Date.now()
    // Episodios de detención registrados al detener el equipo (con o sin OT): se unen a los de las OT (sin doble descuento).
    const episodiosSinOt: OtDetencion[] = detenciones.map(e => ({ equipoId: a.equipoId, faenaId, estado: 'DETENCION', fechaCreacion: e.inicio, fechaTerminoTrabajo: null, episodios: [{ ini: e.inicio, fin: e.fin }] }))
    const otsDetencion: OtDetencion[] = [...episodiosSinOt, ...ots.map(o => ({
      equipoId: o.equipoId, faenaId: o.faenaId, estado: o.estado, fechaCreacion: o.fechaCreacion, fechaTerminoTrabajo: o.fechaTerminoTrabajo, fechaCierre: o.fechaCierre,
      episodios: episodiosDetencionOT(o, liberaciones.map(l => l.liberadoAt), { equipoDetenidoActual: detenidoActual, esUltimaOtDelEquipo: ultimaOt?.id === o.id, iniciosOtrasOt: ots.filter(x => x.id !== o.id).map(x => x.fechaCreacion) }),
    }))]

    lineas.push(
      calcularLineaAsignacion(
        {
          id: a.id, equipoId: a.equipoId, faenaId: a.faenaId, fechaInicio: a.fechaInicio, fechaTermino: a.fechaTermino,
          modalidad, tarifa: Number(a.tarifa), politicaProrateo: a.politicaProrateo, reglaDescuentoDetencion: a.reglaDescuentoDetencion,
        },
        periodo,
        otsDetencion,
        lecturas.map(l => ({ equipoId: l.equipoId, faenaId: l.faenaId, fecha: l.fechaRegistro, horometro: l.horometro === null ? null : Number(l.horometro) })),
      )
    )
  }
  return lineas
}

const totales = (lineas: LineaCalculada[]) => ({
  totalBruto: lineas.reduce((acc, l) => acc + l.montoBruto, 0),
  totalDescuentos: lineas.reduce((acc, l) => acc + l.descuentoDetencion, 0),
  totalNeto: lineas.reduce((acc, l) => acc + l.montoNeto, 0),
})

/** Crea una versión PREPARADA. El índice único parcial de la base impide dos documentos vigentes del mismo periodo, aun con concurrencia. */
async function crearVersion(faenaId: string, inicio: Date, termino: Date, lineas: LineaCalculada[], preparadoPorId: string, extra: { version: number; versionAnteriorId?: string; diferencias?: object }) {
  try {
    return await prisma.estadoPago.create({
      data: { faenaId, periodoInicio: inicio, periodoTermino: termino, estado: 'PREPARADO', preparadoPorId, ...totales(lineas), version: extra.version, versionAnteriorId: extra.versionAnteriorId ?? null, diferenciasConAnterior: extra.diferencias, lineas: { create: lineas } },
      include: { lineas: true },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new Error('Ya existe un Estado de Pago vigente para este periodo')
    throw e
  }
}

// Prepara el Estado de Pago del periodo: solo arriendo, según la asignación vigente de cada equipo en la
// faena, con descuento de detenciones. Queda registrado quién lo preparó: esa persona no podrá aprobarlo.
export async function prepararEstadoPago(faenaId: string, fechaBase?: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_PREPARAR_EP)
  requireAlcanceFaena(sesion, faenaId)

  const { inicio, termino } = calcularPeriodo(fechaBase ? new Date(fechaBase) : new Date())
  const vigente = await prisma.estadoPago.findFirst({ where: { faenaId, periodoInicio: inicio, estado: { in: ['BORRADOR', 'PREPARADO', 'APROBADO'] } } })
  if (vigente) throw new Error('Ya existe un Estado de Pago vigente para este periodo')
  const previas = await prisma.estadoPago.count({ where: { faenaId, periodoInicio: inicio } })
  if (previas > 0) throw new Error('El periodo ya tiene versiones rechazadas o anuladas: usa «reemplazar» para crear la nueva versión vinculada')

  const lineas = await calcularLineasPeriodo(faenaId, inicio, termino)
  const ep = await crearVersion(faenaId, inicio, termino, lineas, sesion.userId, { version: 1 })

  await auditar({ faenaId, entidad: 'EstadoPago', entidadId: ep.id, accion: 'PREPARAR', usuarioId: sesion.userId, valorNuevo: { totalNeto: totales(lineas).totalNeto, version: 1 } })
  revalidatePath('/arriendos')
  return ep.id
}

// Un documento RECHAZADO o ANULADO no se edita: se reemplaza por una versión nueva vinculada a él, recalculada
// con los datos actuales. Se conservan todas las versiones y sus diferencias.
export async function reemplazarEstadoPago(estadoPagoId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_PREPARAR_EP)

  const previo = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId }, include: { lineas: { include: { ajustes: { select: { monto: true } } } } } })
  requireAlcanceFaena(sesion, previo.faenaId)
  if (!admiteReemplazo(previo.estado as EstadoEP)) throw new Error(`Solo se reemplaza un Estado de Pago rechazado o anulado (este está ${previo.estado.toLowerCase()})`)
  const siguiente = await prisma.estadoPago.findFirst({ where: { versionAnteriorId: previo.id } })
  if (siguiente) throw new Error('Este documento ya tiene una versión de reemplazo')

  const lineas = await calcularLineasPeriodo(previo.faenaId, previo.periodoInicio, previo.periodoTermino)
  const comparables = (l: { equipoId: string; asignacionId: string | null; montoBruto: unknown; descuentoDetencion: unknown; montoNeto: unknown }) => ({ equipoId: l.equipoId, asignacionId: l.asignacionId, montoBruto: Number(l.montoBruto), descuentoDetencion: Number(l.descuentoDetencion), montoNeto: Number(l.montoNeto) })
  const diferencias = compararVersiones(
    // Se compara contra el cálculo del previo SIN sus ajustes manuales; los ajustes se dejan explícitos como descartados.
    { totalBruto: Number(previo.totalBruto), totalDescuentos: Number(previo.totalDescuentos), totalNeto: Number(previo.totalNeto) - Number(previo.totalAjustes), lineas: previo.lineas.map(l => comparables({ ...l, montoNeto: Number(l.montoNeto) - l.ajustes.reduce((a, x) => a + Number(x.monto), 0) })) },
    { ...totales(lineas), lineas: lineas.map(comparables) },
  )
  const diferenciasConAjustes = { ...diferencias, ajustesManualesDelPrevioDescartados: Number(previo.totalAjustes) }
  const maxVersion = await prisma.estadoPago.aggregate({ where: { faenaId: previo.faenaId, periodoInicio: previo.periodoInicio }, _max: { version: true } })
  const version = (maxVersion._max.version ?? previo.version) + 1
  const ep = await crearVersion(previo.faenaId, previo.periodoInicio, previo.periodoTermino, lineas, sesion.userId, { version, versionAnteriorId: previo.id, diferencias: diferenciasConAjustes })

  await auditar({ faenaId: previo.faenaId, entidad: 'EstadoPago', entidadId: ep.id, accion: 'REEMPLAZAR', usuarioId: sesion.userId, valorAnterior: { id: previo.id, estado: previo.estado, version: previo.version, totalNeto: Number(previo.totalNeto) }, valorNuevo: { version, totalNeto: totales(lineas).totalNeto, diferencias } })
  revalidatePath('/arriendos')
  return ep.id
}

// Todas las versiones de un periodo, con sus diferencias, para auditoría.
export async function getVersionesEstadoPago(estadoPagoId: string) {
  const sesion = await requireSesion()
  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId }, select: { faenaId: true, periodoInicio: true } })
  requireAlcanceEP(sesion, ep.faenaId)
  return serializar(await prisma.estadoPago.findMany({
    where: { faenaId: ep.faenaId, periodoInicio: ep.periodoInicio }, orderBy: { version: 'asc' },
    select: { id: true, version: true, estado: true, versionAnteriorId: true, totalNeto: true, diferenciasConAnterior: true, motivoRechazo: true, motivoAnulacion: true, preparadoPor: { select: { nombre: true } }, aprobadoPor: { select: { nombre: true } }, createdAt: true },
  }))
}

export async function agregarAjusteManual(lineaId: string, monto: number, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  if (!motivo?.trim()) throw new Error('Debe justificar el ajuste')
  if (!Number.isFinite(monto) || monto === 0) throw new Error('El monto del ajuste no es válido')

  const linea = await prisma.estadoPagoLinea.findUniqueOrThrow({
    where: { id: lineaId },
    include: { estadoPago: true },
  })
  requireAlcanceFaena(sesion, linea.estadoPago.faenaId)
  if (!admiteAjustes(linea.estadoPago.estado as EstadoEP)) throw new Error(`No se puede ajustar un Estado de Pago ${linea.estadoPago.estado.toLowerCase()}`)

  // Condición dentro de la transacción: si el documento se aprueba/rechaza mientras tanto, el ajuste no se aplica.
  await prisma.$transaction(async (tx) => {
    const vigente = await tx.estadoPago.updateMany({
      where: { id: linea.estadoPagoId, estado: { in: ['BORRADOR', 'PREPARADO'] } },
      data: { totalAjustes: { increment: monto }, totalNeto: { increment: monto } },
    })
    if (vigente.count === 0) throw new Error('El Estado de Pago ya no admite ajustes (cambió de estado)')
    await tx.ajusteEstadoPagoLinea.create({ data: { lineaId, monto, motivo: motivo.trim(), usuarioId: sesion.userId } })
    await tx.estadoPagoLinea.update({ where: { id: lineaId }, data: { montoNeto: { increment: monto } } })
  })

  await auditar({
    faenaId: linea.estadoPago.faenaId, entidad: 'EstadoPagoLinea', entidadId: lineaId,
    accion: 'AJUSTE_MANUAL', usuarioId: sesion.userId, valorNuevo: { monto }, motivo: motivo.trim(),
  })

  revalidatePath('/arriendos')
}

// Gerencia (y el ADMINISTRADOR único) aprueba o rechaza; NUNCA quien preparó el documento.
export async function aprobarEstadoPago(estadoPagoId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_DECIDIR_EP)

  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId } })
  requireAlcanceEP(sesion, ep.faenaId)
  if (violaSeparacionDeFunciones(ep.preparadoPorId, sesion.userId)) throw new ErrorAutorizacion('Sin permisos: quien preparó el Estado de Pago no puede aprobarlo')

  if (!puedeTransicionarEP(ep.estado as EstadoEP, 'APROBADO') || ep.estado !== 'PREPARADO') throw new Error(`No se puede aprobar un Estado de Pago ${ep.estado.toLowerCase()}`)
  // Condición en el UPDATE: dos aprobaciones simultáneas no pueden pasar las dos.
  const aprobado = await prisma.estadoPago.updateMany({
    where: { id: estadoPagoId, estado: 'PREPARADO' },
    data: { estado: 'APROBADO', aprobadoPorId: sesion.userId, fechaAprobacion: new Date() },
  })
  if (aprobado.count === 0) throw new Error('El Estado de Pago cambió de estado mientras se aprobaba; recarga e intenta de nuevo')

  await auditar({ faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: estadoPagoId, accion: 'APROBAR', usuarioId: sesion.userId })
  revalidatePath('/arriendos')
}

export async function rechazarEstadoPago(estadoPagoId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_DECIDIR_EP)
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo del rechazo')

  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId } })
  requireAlcanceEP(sesion, ep.faenaId)
  if (violaSeparacionDeFunciones(ep.preparadoPorId, sesion.userId)) throw new ErrorAutorizacion('Sin permisos: quien preparó el Estado de Pago no puede rechazarlo')

  if (ep.estado !== 'PREPARADO') throw new Error(`No se puede rechazar un Estado de Pago ${ep.estado.toLowerCase()}`)
  const rechazado = await prisma.estadoPago.updateMany({
    where: { id: estadoPagoId, estado: 'PREPARADO' },
    data: { estado: 'RECHAZADO', motivoRechazo: motivo.trim() },
  })
  if (rechazado.count === 0) throw new Error('El Estado de Pago cambió de estado mientras se rechazaba; recarga e intenta de nuevo')

  await auditar({ faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: estadoPagoId, accion: 'RECHAZAR', usuarioId: sesion.userId, motivo: motivo.trim() })
  revalidatePath('/arriendos')
}

// Un Estado de Pago APROBADO es inmutable: solo Gerencia lo puede anular, con motivo. La corrección se hace
// con una nueva versión vinculada (reemplazarEstadoPago).
export async function anularEstadoPago(estadoPagoId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_ANULAR_EP)
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo de la anulación')

  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId } })
  requireAlcanceEP(sesion, ep.faenaId)
  if (ep.estado !== 'APROBADO') throw new Error(`Solo se anula un Estado de Pago aprobado (este está ${ep.estado.toLowerCase()})`)

  const r = await prisma.estadoPago.updateMany({
    where: { id: estadoPagoId, estado: 'APROBADO' },
    data: { estado: 'ANULADO', motivoAnulacion: motivo.trim(), anuladoPorId: sesion.userId, fechaAnulacion: new Date() },
  })
  if (r.count === 0) throw new Error('El Estado de Pago cambió de estado mientras se anulaba; recarga e intenta de nuevo')

  await auditar({ faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: estadoPagoId, accion: 'ANULAR', usuarioId: sesion.userId, motivo: motivo.trim(), valorAnterior: { estado: 'APROBADO', totalNeto: Number(ep.totalNeto) } })
  revalidatePath('/arriendos')
}

export async function getEstadosPago() {
  const sesion = await requireSesion()
  const estados = await prisma.estadoPago.findMany({
    where: { faenaId: sesion.faenaId },
    include: {
      lineas: { include: { equipo: { select: { codigo: true, nombre: true } } } },
      preparadoPor: { select: { nombre: true } },
      aprobadoPor: { select: { nombre: true } },
    },
    orderBy: { periodoInicio: 'desc' },
  })
  return serializar(estados)
}

export async function getEstadoPagoDetalle(id: string) {
  const sesion = await requireSesion()
  const ep = await prisma.estadoPago.findUniqueOrThrow({
    where: { id },
    include: {
      faena: { select: { nombre: true, codigo: true } },
      preparadoPor: { select: { nombre: true } },
      aprobadoPor: { select: { nombre: true } },
      lineas: {
        include: {
          equipo: { select: { codigo: true, nombre: true } },
          ajustes: { include: { usuario: { select: { nombre: true } } } },
        },
      },
    },
  })
  requireAlcanceEP(sesion, ep.faenaId)
  return serializar(ep)
}
