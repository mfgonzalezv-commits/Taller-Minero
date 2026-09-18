// Protección para que scripts destructivos (seeds, pruebas con datos falsos,
// utilidades de mantenimiento) nunca se ejecuten por error contra la base de
// producción. Identifica el entorno por el NOMBRE de la base en
// DATABASE_URL, no por NODE_ENV — porque un `node script.js` local corre con
// NODE_ENV=development aunque la URL apunte a producción.

const NOMBRE_BASE_PRODUCCION = 'erp_minera'

export function nombreBaseDesdeUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) return ''
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, '')
  } catch {
    return ''
  }
}

export function esBaseProduccion(databaseUrl: string | undefined = process.env.DATABASE_URL): boolean {
  return nombreBaseDesdeUrl(databaseUrl) === NOMBRE_BASE_PRODUCCION
}

/** Descripción legible del entorno actual, para logging de arranque (nunca imprime la URL completa). */
export function descripcionEntornoActual(): string {
  const nombreBase = nombreBaseDesdeUrl(process.env.DATABASE_URL)
  const esProd = esBaseProduccion()
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  return `entorno=${nodeEnv} base="${nombreBase || 'desconocida'}" (${esProd ? 'PRODUCCIÓN' : 'desarrollo'})`
}

/**
 * Llamar al inicio de todo script destructivo (seed, borrado masivo, carga de
 * datos de prueba, etc.). Termina el proceso si la base conectada es la de
 * producción.
 */
export function impedirEjecucionEnProduccion(operacion: string): void {
  if (esBaseProduccion()) {
    console.error(
      `\n🚫 BLOQUEADO: "${operacion}" no puede ejecutarse contra la base de producción ("${NOMBRE_BASE_PRODUCCION}").\n` +
        'Si de verdad necesitas correr esto en producción, hazlo manualmente y de forma explícita — este script no lo permite.\n'
    )
    process.exit(1)
  }
}
