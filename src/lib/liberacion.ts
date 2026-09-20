// Liberación operacional de un equipo detenido. Lógica PURA.
// - Si hubo reparación: la OT debe tener la validación técnica del Jefe (Central si no hay Jefe local)
//   antes de que Jefe/Planificador de la faena libere el equipo.
// - Si no requirió reparación: libera Jefe/Planificador con motivo obligatorio.
export interface ContextoLiberacion {
  estadoEquipo: string
  /** OT del equipo aún en curso (sin llegar a validación técnica). */
  hayOtEnCurso: boolean
  /** Última OT reparada desde la última liberación (EN_VALIDACION o CERRADA), o null si no hubo reparación. */
  otReparada: { validadaTecnicamente: boolean } | null
  motivo?: string
}

export function evaluarLiberacion(c: ContextoLiberacion): string | null {
  if (!['DETENIDO', 'DETENIDO_PENDIENTE_VALIDACION', 'TALLER', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(c.estadoEquipo)) return 'El equipo no está detenido'
  if (c.hayOtEnCurso) return 'El equipo tiene una OT en reparación: no se puede liberar hasta terminarla y validarla técnicamente'
  if (c.otReparada) return c.otReparada.validadaTecnicamente ? null : 'La reparación necesita la validación técnica del Jefe de Taller antes de liberar el equipo'
  if (!c.motivo?.trim()) return 'Debe indicar el motivo: el equipo se libera sin reparación'
  return null
}
