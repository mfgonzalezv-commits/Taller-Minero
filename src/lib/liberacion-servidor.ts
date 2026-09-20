import { prisma } from './prisma'
import { evaluarLiberacion } from './liberacion'

const EN_CURSO = ['ABIERTA', 'EN_DIAGNOSTICO', 'DIAGNOSTICADO', 'REPARACION_PROGRAMADA', 'LISTO_PARA_REPARAR', 'EN_REPARACION', 'ESPERA_REPUESTO'] as const

/**
 * Regla ÚNICA de liberación operacional, usada por TODAS las vías que devuelven un equipo a operar (liberarEquipo,
 * descartar una detención, operar con observación): sin OT correctiva en curso, con la validación técnica de la reparación
 * si la hubo y con motivo si no hubo reparación. Devuelve el error (o null) y la OT reparada que respalda la liberación.
 */
export async function verificarLiberacionEquipo(equipoId: string, faenaId: string, estado: string, motivo?: string): Promise<{ error: string | null; otReparadaId: string | null }> {
  const ultima = await prisma.liberacionEquipo.findFirst({ where: { equipoId }, orderBy: { liberadoAt: 'desc' }, select: { liberadoAt: true } })
  const [enCurso, reparada] = await Promise.all([
    prisma.ordenTrabajo.count({ where: { equipoId, faenaId, tipoMantenimiento: 'CORRECTIVO', estado: { in: [...EN_CURSO] } } }),
    prisma.ordenTrabajo.findFirst({ where: { equipoId, faenaId, estado: { in: ['EN_VALIDACION', 'CERRADA'] }, fechaTerminoTrabajo: { gt: ultima?.liberadoAt ?? new Date(0) } }, orderBy: { fechaTerminoTrabajo: 'desc' }, select: { id: true, fechaValidacionTecnica: true } }),
  ])
  const error = evaluarLiberacion({ estadoEquipo: estado, hayOtEnCurso: enCurso > 0, otReparada: reparada ? { validadaTecnicamente: !!reparada.fechaValidacionTecnica } : null, motivo })
  return { error, otReparadaId: reparada?.id ?? null }
}
