'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_LIBERAR_EQUIPO } from '@/lib/permisos-roles'
import { verificarLiberacionEquipo } from '@/lib/liberacion-servidor'
import { PrioridadOT } from '@prisma/client'

function sugerirPrioridad(riesgoSeguridad: boolean, impactoProductivo?: string): PrioridadOT {
  if (riesgoSeguridad) return 'CRITICA'
  if (impactoProductivo === 'ALTO') return 'ALTA'
  if (impactoProductivo === 'MEDIO') return 'MEDIA'
  return 'BAJA'
}

export async function crearReporteFalla(data: {
  equipoId: string
  funcion?: string
  ubicacion?: string
  descripcion: string
  fotos?: string[]
  impactoProductivo?: 'BAJO' | 'MEDIO' | 'ALTO'
  riesgoSeguridad: boolean
  detencionSolicitada: boolean
}) {
  const sesion = await requireSesion()

  const equipo = await prisma.equipo.findUniqueOrThrow({
    where: { id: data.equipoId },
    select: { faenaId: true, estado: true },
  })
  requireAlcanceFaena(sesion, equipo.faenaId)

  const prioridadSugerida = sugerirPrioridad(data.riesgoSeguridad, data.impactoProductivo)

  const reporte = await prisma.$transaction(async (tx) => {
    const r = await tx.reporteFalla.create({
      data: {
        faenaId: equipo.faenaId,
        equipoId: data.equipoId,
        reportadoPorId: sesion.userId,
        funcion: data.funcion ?? null,
        ubicacion: data.ubicacion ?? null,
        descripcion: data.descripcion,
        fotos: data.fotos ?? [],
        impactoProductivo: data.impactoProductivo ?? null,
        riesgoSeguridad: data.riesgoSeguridad,
        prioridadSugerida,
        prioridad: prioridadSugerida,
        detencionSolicitada: data.detencionSolicitada,
      },
    })

    // Detención crítica: el operador detiene el equipo de inmediato,
    // queda pendiente de validación por el jefe de taller.
    if (data.detencionSolicitada) {
      await tx.equipo.update({
        where: { id: data.equipoId },
        data: { estado: 'DETENIDO_PENDIENTE_VALIDACION' },
      })
    }

    return r
  })

  await auditar({
    faenaId: equipo.faenaId,
    entidad: 'ReporteFalla',
    entidadId: reporte.id,
    accion: 'CREAR',
    usuarioId: sesion.userId,
    valorNuevo: { prioridad: prioridadSugerida, detencionSolicitada: data.detencionSolicitada },
  })

  revalidatePath('/fallas')
  revalidatePath('/equipos')
  return reporte.id
}

// Jefe de taller confirma o rechaza la detención solicitada por el operador.
// Si confirma, el equipo queda DETENIDO y el contador de detención se cuenta
// desde la hora original del reporte (fecha del ReporteFalla), no desde ahora.
export async function validarDetencion(reporteId: string, confirmar: boolean, motivo?: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])

  const reporte = await prisma.reporteFalla.findUniqueOrThrow({ where: { id: reporteId } })
  requireAlcanceFaena(sesion, reporte.faenaId)
  // Descartar la detención devuelve el equipo a operar: es una liberación (Jefe/Planificador de la misma faena, con motivo).
  if (!confirmar) {
    requireRolPermitido(sesion, ROLES_LIBERAR_EQUIPO)
    if (reporte.faenaId !== sesion.faenaId) throw new ErrorAutorizacion('Sin permisos: el equipo pertenece a otra faena')
    if (!motivo?.trim()) throw new Error('Debe indicar el motivo para descartar la detención')
    // Misma regla que la liberación: no se descarta con una OT en reparación ni saltándose la validación técnica.
    const eq = await prisma.equipo.findUniqueOrThrow({ where: { id: reporte.equipoId }, select: { estado: true } })
    const v = await verificarLiberacionEquipo(reporte.equipoId, reporte.faenaId, eq.estado, motivo)
    if (v.error) throw new Error(v.error)
  }

  await prisma.$transaction([
    prisma.reporteFalla.update({
      where: { id: reporteId },
      data: {
        detencionConfirmada: confirmar,
        motivoRechazoDetencion: confirmar ? null : (motivo ?? null),
        estado: 'EVALUADO',
      },
    }),
    prisma.equipo.update({
      where: { id: reporte.equipoId },
      data: { estado: confirmar ? 'DETENIDO' : 'OPERATIVO' },
    }),
    ...(confirmar ? [] : [prisma.liberacionEquipo.create({ data: { equipoId: reporte.equipoId, faenaId: reporte.faenaId, liberadoPorId: sesion.userId, motivo: motivo!.trim(), tipo: 'DETENCION_DESCARTADA' } })]),
  ])

  await auditar({
    faenaId: reporte.faenaId,
    entidad: 'ReporteFalla',
    entidadId: reporteId,
    accion: confirmar ? 'CONFIRMAR_DETENCION' : 'RECHAZAR_DETENCION',
    usuarioId: sesion.userId,
    motivo: motivo ?? null,
  })

  revalidatePath('/fallas')
  revalidatePath('/equipos')
}

export async function cambiarPrioridadReporte(reporteId: string, nuevaPrioridad: PrioridadOT, justificacion: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])
  if (!justificacion?.trim()) throw new Error('Debe justificar el cambio de prioridad')

  const reporte = await prisma.reporteFalla.findUniqueOrThrow({ where: { id: reporteId } })
  requireAlcanceFaena(sesion, reporte.faenaId)

  await prisma.reporteFalla.update({
    where: { id: reporteId },
    data: { prioridad: nuevaPrioridad, justificacionCambioPrioridad: justificacion.trim() },
  })

  await auditar({
    faenaId: reporte.faenaId,
    entidad: 'ReporteFalla',
    entidadId: reporteId,
    accion: 'CAMBIAR_PRIORIDAD',
    usuarioId: sesion.userId,
    valorAnterior: { prioridad: reporte.prioridad },
    valorNuevo: { prioridad: nuevaPrioridad },
    motivo: justificacion.trim(),
  })

  revalidatePath('/fallas')
}

export async function cerrarReporteSinOT(reporteId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo de cierre')

  const reporte = await prisma.reporteFalla.findUniqueOrThrow({ where: { id: reporteId } })
  requireAlcanceFaena(sesion, reporte.faenaId)

  await prisma.reporteFalla.update({
    where: { id: reporteId },
    data: { estado: 'CERRADO_SIN_OT', motivoCierre: motivo.trim() },
  })

  await auditar({
    faenaId: reporte.faenaId,
    entidad: 'ReporteFalla',
    entidadId: reporteId,
    accion: 'CERRAR_SIN_OT',
    usuarioId: sesion.userId,
    motivo: motivo.trim(),
  })

  revalidatePath('/fallas')
}

// El planificador convierte el reporte en una OT formal, preservando el
// origen (para no perder la trazabilidad falla → OT).
export async function convertirReporteEnOT(reporteId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])

  const reporte = await prisma.reporteFalla.findUniqueOrThrow({ where: { id: reporteId } })
  requireAlcanceFaena(sesion, reporte.faenaId)
  if (reporte.estado === 'CONVERTIDO_OT') throw new Error('Este reporte ya fue convertido en OT')

  const equipo = await prisma.equipo.findUniqueOrThrow({
    where: { id: reporte.equipoId },
    select: { costoHoraDetencion: true },
  })

  const ot = await prisma.$transaction(async (tx) => {
    const nuevaOt = await tx.ordenTrabajo.create({
      data: {
        faenaId: reporte.faenaId,
        equipoId: reporte.equipoId,
        tipoMantenimiento: 'CORRECTIVO',
        estado: 'ABIERTA',
        prioridad: reporte.prioridad,
        origenFalla: 'REPORTE_OPERADOR',
        descripcionFalla: reporte.descripcion,
        reportadaPorNombre: null,
        creadoPorId: sesion.userId,
        costoHoraSnapshot: equipo.costoHoraDetencion,
      },
    })

    await tx.reporteFalla.update({
      where: { id: reporteId },
      data: { estado: 'CONVERTIDO_OT', otId: nuevaOt.id },
    })

    return nuevaOt
  })

  await auditar({
    faenaId: reporte.faenaId,
    entidad: 'ReporteFalla',
    entidadId: reporteId,
    accion: 'CONVERTIR_EN_OT',
    usuarioId: sesion.userId,
    valorNuevo: { otId: ot.id },
  })

  revalidatePath('/fallas')
  revalidatePath('/ot')
  return ot.id
}

export async function getReportesFalla(soloActivos = true) {
  const sesion = await requireSesion()
  return prisma.reporteFalla.findMany({
    where: {
      faenaId: sesion.faenaId,
      ...(soloActivos ? { estado: { in: ['PENDIENTE', 'EVALUADO'] } } : {}),
    },
    include: {
      equipo: { select: { codigo: true, nombre: true } },
      reportadoPor: { select: { nombre: true } },
    },
    orderBy: [{ riesgoSeguridad: 'desc' }, { fecha: 'desc' }],
  })
}
