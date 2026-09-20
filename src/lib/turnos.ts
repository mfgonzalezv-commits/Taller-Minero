// Régimen de turnos (retrocompatible y opcional). La jornada Día/Noche sigue en Tecnico.turno.
// No hay cuentas compartidas: cada persona tiene su usuario y su grupo.
export const SISTEMAS_TURNO = ['7X7', '14X14'] as const
export const GRUPOS_TURNO = ['A', 'B'] as const

export function validarTurno(t: { sistemaTurno?: string | null; grupoTurno?: string | null }): string | null {
  const s = t.sistemaTurno?.trim().toUpperCase() || null, g = t.grupoTurno?.trim().toUpperCase() || null
  if (!s && !g) return null
  if (!s || !g) return 'El sistema de turno y el grupo deben indicarse juntos'
  if (!(SISTEMAS_TURNO as readonly string[]).includes(s)) return `Sistema de turno inválido "${t.sistemaTurno}" (válidos: 7X7, 14X14)`
  if (!(GRUPOS_TURNO as readonly string[]).includes(g)) return `Grupo de turno inválido "${t.grupoTurno}" (válidos: A, B)`
  return null
}
export const normalizarTurno = (t: { sistemaTurno?: string | null; grupoTurno?: string | null }) => ({
  sistemaTurno: t.sistemaTurno?.trim().toUpperCase() || null, grupoTurno: t.grupoTurno?.trim().toUpperCase() || null,
})
