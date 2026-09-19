'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'
import { calcularPeriodo } from '@/lib/periodo-pago'
import { calcularLineaAsignacion, type LineaCalculada } from '@/lib/linea-estado-pago'
import { ventanaEfectiva } from '@/lib/detencion-periodo'

// Prepara el Estado de Pago del periodo: solo arriendo, según la asignación
// vigente de cada equipo (Fase 2) en la faena, con descuento de detenciones.
// No incluye reparaciones, repuestos ni servicios externos — eso es la OT.
export async function prepararEstadoPago(faenaId: string, fechaBase?: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  requireAlcanceFaena(sesion, faenaId)

  const { inicio, termino } = calcularPeriodo(fechaBase ? new Date(fechaBase) : new Date())

  const existente = await prisma.estadoPago.findUnique({
    where: { faenaId_periodoInicio: { faenaId, periodoInicio: inicio } },
  })
  if (existente) throw new Error('Ya existe un Estado de Pago preparado para este periodo')

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

    // Solo datos del mismo equipo Y de la misma faena, dentro de la ventana
    // efectiva (periodo ∩ vigencia de la asignación), sin OT anuladas.
    const [ots, lecturas] = v
      ? await Promise.all([
          prisma.ordenTrabajo.findMany({
            where: {
              equipoId: a.equipoId,
              faenaId,
              estado: { not: 'ANULADA' },
              fechaCreacion: { lte: v.termino },
              OR: [{ fechaTerminoTrabajo: null }, { fechaTerminoTrabajo: { gte: v.inicio } }],
            },
            select: { equipoId: true, faenaId: true, estado: true, fechaCreacion: true, fechaTerminoTrabajo: true, fechaCierre: true },
          }),
          modalidad === 'HORA'
            ? prisma.horometroKm.findMany({
                where: { equipoId: a.equipoId, faenaId, fechaRegistro: { gte: v.inicio, lte: v.termino }, horometro: { not: null } },
                orderBy: { fechaRegistro: 'asc' },
                select: { equipoId: true, faenaId: true, fechaRegistro: true, horometro: true },
              })
            : Promise.resolve([]),
        ])
      : [[], []]

    lineas.push(
      calcularLineaAsignacion(
        {
          id: a.id, equipoId: a.equipoId, faenaId: a.faenaId, fechaInicio: a.fechaInicio, fechaTermino: a.fechaTermino,
          modalidad, tarifa: Number(a.tarifa), politicaProrateo: a.politicaProrateo, reglaDescuentoDetencion: a.reglaDescuentoDetencion,
        },
        periodo,
        ots,
        lecturas.map(l => ({ equipoId: l.equipoId, faenaId: l.faenaId, fecha: l.fechaRegistro, horometro: l.horometro === null ? null : Number(l.horometro) })),
      )
    )
  }

  const totalBruto = lineas.reduce((acc, l) => acc + l.montoBruto, 0)
  const totalDescuentos = lineas.reduce((acc, l) => acc + l.descuentoDetencion, 0)
  const totalNeto = lineas.reduce((acc, l) => acc + l.montoNeto, 0)

  const estadoPago = await prisma.estadoPago.create({
    data: {
      faenaId,
      periodoInicio: inicio,
      periodoTermino: termino,
      estado: 'PREPARADO',
      preparadoPorId: sesion.userId,
      totalBruto,
      totalDescuentos,
      totalNeto,
      lineas: { create: lineas },
    },
    include: { lineas: true },
  })

  await auditar({
    faenaId, entidad: 'EstadoPago', entidadId: estadoPago.id, accion: 'PREPARAR',
    usuarioId: sesion.userId, valorNuevo: { totalNeto },
  })

  revalidatePath('/arriendos')
  return estadoPago.id
}

export async function agregarAjusteManual(lineaId: string, monto: number, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  if (!motivo?.trim()) throw new Error('Debe justificar el ajuste')

  const linea = await prisma.estadoPagoLinea.findUniqueOrThrow({
    where: { id: lineaId },
    include: { estadoPago: true },
  })
  requireAlcanceFaena(sesion, linea.estadoPago.faenaId)
  if (linea.estadoPago.estado === 'APROBADO') throw new Error('No se puede ajustar un Estado de Pago ya aprobado')

  await prisma.$transaction([
    prisma.ajusteEstadoPagoLinea.create({
      data: { lineaId, monto, motivo: motivo.trim(), usuarioId: sesion.userId },
    }),
    prisma.estadoPagoLinea.update({
      where: { id: lineaId },
      data: { montoNeto: { increment: monto } },
    }),
    prisma.estadoPago.update({
      where: { id: linea.estadoPagoId },
      data: { totalAjustes: { increment: monto }, totalNeto: { increment: monto } },
    }),
  ])

  await auditar({
    faenaId: linea.estadoPago.faenaId, entidad: 'EstadoPagoLinea', entidadId: lineaId,
    accion: 'AJUSTE_MANUAL', usuarioId: sesion.userId, valorNuevo: { monto }, motivo: motivo.trim(),
  })

  revalidatePath('/arriendos')
}

// Solo Gerencia aprueba (o rechaza) el Estado de Pago.
export async function aprobarEstadoPago(estadoPagoId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'GERENCIA'])

  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId } })
  requireAlcanceFaena(sesion, ep.faenaId)

  await prisma.estadoPago.update({
    where: { id: estadoPagoId },
    data: { estado: 'APROBADO', aprobadoPorId: sesion.userId, fechaAprobacion: new Date() },
  })

  await auditar({
    faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: estadoPagoId,
    accion: 'APROBAR', usuarioId: sesion.userId,
  })

  revalidatePath('/arriendos')
}

export async function rechazarEstadoPago(estadoPagoId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'GERENCIA'])
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo del rechazo')

  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId } })
  requireAlcanceFaena(sesion, ep.faenaId)

  await prisma.estadoPago.update({
    where: { id: estadoPagoId },
    data: { estado: 'RECHAZADO', motivoRechazo: motivo.trim() },
  })

  await auditar({
    faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: estadoPagoId,
    accion: 'RECHAZAR', usuarioId: sesion.userId, motivo: motivo.trim(),
  })

  revalidatePath('/arriendos')
}

export async function getEstadosPago() {
  const sesion = await requireSesion()
  return prisma.estadoPago.findMany({
    where: { faenaId: sesion.faenaId },
    include: {
      lineas: { include: { equipo: { select: { codigo: true, nombre: true } } } },
      preparadoPor: { select: { nombre: true } },
      aprobadoPor: { select: { nombre: true } },
    },
    orderBy: { periodoInicio: 'desc' },
  })
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
  requireAlcanceFaena(sesion, ep.faenaId)
  return ep
}
