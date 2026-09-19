// Condiciones para que el importador ESCRIBA en una base. Lógica PURA.
// Por defecto todo es dry-run (solo lectura). Para aplicar hay que identificar la base y la faena
// y escribir la frase de confirmación exacta. En producción, además, se necesita una variable de
// entorno de autorización que hoy NO está concedida.
export const BASE_PRODUCCION = 'erp_minera'

export interface ArgsApply {
  apply: boolean
  faena?: string
  base?: string
  confirmo?: string
  simularFalla?: boolean
}

export function fraseConfirmacion(faena: string, base: string): string {
  return `CARGAR ${faena.toUpperCase()} EN ${base}`
}

/** Devuelve un mensaje de error si NO se puede aplicar; null si se puede. */
export function verificarApply(a: ArgsApply, baseActual: string, entorno: Record<string, string | undefined> = process.env): string | null {
  if (!a.apply) return null // dry-run: siempre permitido (solo lectura)
  if (!baseActual) return 'No se pudo identificar la base de datos de DATABASE_URL'
  if (!a.faena) return '--apply exige indicar la faena con --faena CODIGO'
  if (!a.base) return `--apply exige identificar la base con --base ${baseActual}`
  if (a.base !== baseActual) return `--base "${a.base}" no coincide con la base conectada "${baseActual}"`
  const frase = fraseConfirmacion(a.faena, baseActual)
  if (a.confirmo !== frase) return `Confirmación inválida. Para continuar escribe exactamente: --confirmo "${frase}"`
  if (baseActual === BASE_PRODUCCION) {
    if (entorno.IMPORTADOR_PRODUCCION_AUTORIZADO !== 'SI') return 'La carga en PRODUCCIÓN no está autorizada (falta la autorización explícita del propietario)'
    if (a.simularFalla) return '--simular-falla no está permitido en producción'
  }
  return null
}
