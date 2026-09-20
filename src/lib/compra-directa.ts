// Reglas de la compra directa excepcional. Lógica PURA.
// - Puede marcarse sin cotizaciones previas solo por emergencia (con motivo).
// - Para REGULARIZARLA exige comprobante, motivo y al menos una cotización de respaldo.
// - Sobre el límite de faena requiere aprobación central antes de regularizar.
// El monto del límite es un valor inicial y queda parametrizable a futuro por faena.
/** Total final, IVA incluido. Por debajo se compra en la faena; DESDE este monto requiere aprobación del Jefe de Taller Central. */
export const LIMITE_COMPRA_DIRECTA_FAENA = 250_000

export interface DatosRegularizacion {
  cotizaciones: string[]
  comprobante: string
  motivo: string
  monto: number
}

/** Mensaje de error si los datos no alcanzan para regularizar; null si están completos. */
export function validarRegularizacion(d: DatosRegularizacion): string | null {
  if (!d.comprobante?.trim()) return 'Debe indicar el comprobante de la compra'
  if (!d.motivo?.trim()) return 'Debe indicar el motivo de la regularización'
  if (!Array.isArray(d.cotizaciones) || d.cotizaciones.filter(c => c?.trim()).length < 1) return 'Debe adjuntar al menos una cotización de respaldo'
  if (!(d.monto >= 0) || !Number.isFinite(d.monto)) return 'El monto de la compra no es válido'
  return null
}

export function requiereAprobacionCentral(monto: number, limite = LIMITE_COMPRA_DIRECTA_FAENA): boolean {
  return monto >= limite
}
