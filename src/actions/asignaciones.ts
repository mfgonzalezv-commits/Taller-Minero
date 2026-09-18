'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, auditar } from '@/lib/authz'
import { ModalidadArriendo, PoliticaProrateo } from '@prisma/client'

// Traslada un equipo a otra faena dejando historial trazable: cierra la
// asignación activa (si existe) y abre una nueva. Equipo.faenaId se mantiene
// sincronizado como "ubicación actual" por compatibilidad con el resto del
// sistema, pero la fuente de verdad para cálculos (Estado de Pago, Fase 9)
// es este historial.
export async function trasladarEquipoConHistorial(data: {
  equipoId: string
  faenaDestinoId: string
  motivo?: string
  contrato?: string
  modalidadArriendo?: ModalidadArriendo
  tarifa?: number
  reglaDescuentoDetencion?: string
  /** Solo aplica a modalidad MES. Por defecto DIAS_REALES si no se indica. */
  politicaProrateo?: PoliticaProrateo
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])

  const equipo = await prisma.equipo.findUniqueOrThrow({
    where: { id: data.equipoId },
    select: { faenaId: true },
  })

  const ahora = new Date()

  await prisma.$transaction(async (tx) => {
    // Cerrar la asignación activa (fechaTermino null), si existe.
    await tx.asignacionEquipoFaena.updateMany({
      where: { equipoId: data.equipoId, fechaTermino: null },
      data: { fechaTermino: ahora },
    })

    await tx.asignacionEquipoFaena.create({
      data: {
        equipoId: data.equipoId,
        faenaId: data.faenaDestinoId,
        fechaInicio: ahora,
        motivo: data.motivo ?? null,
        usuarioResponsableId: sesion.userId,
        contrato: data.contrato ?? null,
        modalidadArriendo: data.modalidadArriendo ?? null,
        tarifa: data.tarifa ?? null,
        reglaDescuentoDetencion: data.reglaDescuentoDetencion ?? null,
        politicaProrateo: data.politicaProrateo ?? 'DIAS_REALES',
      },
    })

    await tx.equipo.update({
      where: { id: data.equipoId },
      data: { faenaId: data.faenaDestinoId },
    })
  })

  await auditar({
    entidad: 'Equipo',
    entidadId: data.equipoId,
    accion: 'TRASLADAR_FAENA',
    usuarioId: sesion.userId,
    valorAnterior: { faenaId: equipo.faenaId },
    valorNuevo: { faenaId: data.faenaDestinoId },
    motivo: data.motivo ?? null,
  })

  revalidatePath('/faenas')
  revalidatePath('/equipos')
  revalidatePath(`/equipos/${data.equipoId}`)
}

export async function getHistorialAsignaciones(equipoId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'GERENCIA'])

  return prisma.asignacionEquipoFaena.findMany({
    where: { equipoId },
    include: {
      faena: { select: { nombre: true, codigo: true } },
      usuarioResponsable: { select: { nombre: true } },
    },
    orderBy: { fechaInicio: 'desc' },
  })
}

// Asignación (tarifa/contrato) vigente de un equipo — base para el Estado de
// Pago de la Fase 9.
export async function getAsignacionActiva(equipoId: string) {
  await requireSesion()
  return prisma.asignacionEquipoFaena.findFirst({
    where: { equipoId, fechaTermino: null },
    include: { faena: { select: { nombre: true, codigo: true } } },
  })
}
