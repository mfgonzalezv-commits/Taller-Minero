// Máquina de estados de la OT (decisión de negocio). Lógica PURA.
// - No se cierra sin pasar por EN_VALIDACION y sin validación técnica del Jefe de Taller.
// - No se retrocede de EN_REPARACION a ABIERTA.
// - Una OT CERRADA solo se reabre con la acción específica `reabrirOT` (Jefe/Admin, con motivo
//   y auditoría); ANULADA se hace con `anularOT`. Ninguna se hace con `cambiarEstadoOT`.
export type EstadoOTMaquina =
  | 'PROGRAMADA' | 'ABIERTA' | 'EN_DIAGNOSTICO' | 'DIAGNOSTICADO' | 'REPARACION_PROGRAMADA'
  | 'LISTO_PARA_REPARAR' | 'EN_REPARACION' | 'ESPERA_REPUESTO' | 'EN_VALIDACION' | 'CERRADA' | 'ANULADA'

export const TRANSICIONES_OT: Record<string, string[]> = {
  PROGRAMADA: ['ABIERTA'],
  ABIERTA: ['EN_DIAGNOSTICO'],
  EN_DIAGNOSTICO: ['DIAGNOSTICADO'],
  DIAGNOSTICADO: ['EN_REPARACION', 'REPARACION_PROGRAMADA', 'ESPERA_REPUESTO'],
  REPARACION_PROGRAMADA: ['EN_REPARACION', 'LISTO_PARA_REPARAR'],
  LISTO_PARA_REPARAR: ['EN_REPARACION', 'REPARACION_PROGRAMADA'],
  EN_REPARACION: ['ESPERA_REPUESTO', 'EN_VALIDACION'],
  ESPERA_REPUESTO: ['LISTO_PARA_REPARAR'],
  EN_VALIDACION: ['CERRADA', 'EN_REPARACION'],
  CERRADA: [],
  ANULADA: [],
}

export function puedeTransicionarOT(actual: string, destino: string): boolean {
  return (TRANSICIONES_OT[actual] ?? []).includes(destino)
}

/** Estados a los que no se llega por la bitácora ni por cambios rápidos: tienen reglas propias. */
export const ESTADOS_CON_ACCION_PROPIA: string[] = ['EN_VALIDACION', 'CERRADA', 'ANULADA']

/** Mensaje de error si la transición no está permitida; null si lo está. */
export function validarTransicionOT(actual: string, destino: string, opts: { validadaTecnicamente: boolean }): string | null {
  if (destino === 'ANULADA') return 'Para anular una OT usa la acción de anulación'
  if (actual === 'CERRADA') return 'La OT está cerrada: para reabrirla usa la acción de reapertura (Jefe o Administrador, con motivo)'
  if (!puedeTransicionarOT(actual, destino)) return `Transición no permitida: ${actual} → ${destino}`
  if (destino === 'CERRADA' && !opts.validadaTecnicamente) return 'La OT necesita la validación técnica del Jefe de Taller antes de cerrarse'
  return null
}
