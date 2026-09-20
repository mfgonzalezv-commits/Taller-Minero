// Máquina de estados del Estado de Pago. Lógica PURA.
// PREPARADO → APROBADO | RECHAZADO. RECHAZADO y ANULADO son terminales e inmutables.
// APROBADO es inmutable: solo Gerencia lo puede ANULAR (con motivo). Un rechazado o anulado se
// reemplaza con una NUEVA VERSIÓN vinculada; ninguna versión se borra ni se edita.
export type EstadoEP = 'BORRADOR' | 'PREPARADO' | 'APROBADO' | 'RECHAZADO' | 'ANULADO'

const TRANSICIONES: Record<EstadoEP, EstadoEP[]> = {
  BORRADOR: ['PREPARADO'],
  PREPARADO: ['APROBADO', 'RECHAZADO'],
  APROBADO: ['ANULADO'],
  RECHAZADO: [],
  ANULADO: [],
}

export function puedeTransicionarEP(actual: EstadoEP, destino: EstadoEP): boolean {
  return TRANSICIONES[actual].includes(destino)
}

/** Solo un EP preparado admite ajustes manuales. */
export function admiteAjustes(actual: EstadoEP): boolean {
  return actual === 'PREPARADO' || actual === 'BORRADOR'
}

/** Solo un documento rechazado o anulado se reemplaza por una versión nueva. */
export function admiteReemplazo(actual: EstadoEP): boolean {
  return actual === 'RECHAZADO' || actual === 'ANULADO'
}

/** Nadie decide sobre un documento que él mismo preparó. */
export function violaSeparacionDeFunciones(preparadoPorId: string | null, usuarioId: string): boolean {
  return preparadoPorId !== null && preparadoPorId === usuarioId
}

export interface LineaComparable { equipoId: string; asignacionId: string | null; montoBruto: number; descuentoDetencion: number; montoNeto: number }
export interface Diferencias {
  totales: { bruto: number; descuentos: number; neto: number }
  lineas: { equipoId: string; asignacionId: string | null; cambio: 'NUEVA' | 'ELIMINADA' | 'MODIFICADA'; netoAntes: number; netoDespues: number }[]
}

/** Diferencias entre dos versiones (nueva − anterior), para dejarlas en la auditoría. */
export function compararVersiones(anterior: { totalBruto: number; totalDescuentos: number; totalNeto: number; lineas: LineaComparable[] }, nueva: { totalBruto: number; totalDescuentos: number; totalNeto: number; lineas: LineaComparable[] }): Diferencias {
  const clave = (l: LineaComparable) => `${l.equipoId}|${l.asignacionId ?? ''}`
  const a = new Map(anterior.lineas.map(l => [clave(l), l])), n = new Map(nueva.lineas.map(l => [clave(l), l]))
  const lineas: Diferencias['lineas'] = []
  for (const [k, l] of n) {
    const p = a.get(k)
    if (!p) lineas.push({ equipoId: l.equipoId, asignacionId: l.asignacionId, cambio: 'NUEVA', netoAntes: 0, netoDespues: l.montoNeto })
    else if (Math.abs(p.montoNeto - l.montoNeto) > 0.005 || Math.abs(p.montoBruto - l.montoBruto) > 0.005) lineas.push({ equipoId: l.equipoId, asignacionId: l.asignacionId, cambio: 'MODIFICADA', netoAntes: p.montoNeto, netoDespues: l.montoNeto })
  }
  for (const [k, l] of a) if (!n.has(k)) lineas.push({ equipoId: l.equipoId, asignacionId: l.asignacionId, cambio: 'ELIMINADA', netoAntes: l.montoNeto, netoDespues: 0 })
  return { totales: { bruto: nueva.totalBruto - anterior.totalBruto, descuentos: nueva.totalDescuentos - anterior.totalDescuentos, neto: nueva.totalNeto - anterior.totalNeto }, lineas }
}
