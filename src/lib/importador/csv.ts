// Lector de planillas CSV (UTF-8, separador ; o ,) sin dependencias. Lógica PURA.
// Excel en español guarda con ";" y decimales con coma: ambos se aceptan.

export type Fila = Record<string, string> & { __linea: string }

function detectarSeparador(primeraLinea: string): string {
  const pv = (primeraLinea.match(/;/g) ?? []).length
  const c = (primeraLinea.match(/,/g) ?? []).length
  return pv >= c && pv > 0 ? ';' : ','
}

/** Divide el texto en registros respetando comillas ("" = comilla literal, saltos de línea dentro de comillas). */
export interface ProblemaCsv { linea: number | null; mensaje: string }

export function parsearCsv(texto: string): { encabezados: string[]; filas: Fila[]; problemas: ProblemaCsv[] } {
  const t = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const primera = t.split('\n').find(l => l.trim() !== '') ?? ''
  const sep = detectarSeparador(primera)
  const registros: { campos: string[]; linea: number }[] = []
  let campo = '', campos: string[] = [], enComillas = false, linea = 1, lineaInicio = 1
  const cerrarRegistro = () => {
    campos.push(campo)
    if (campos.some(c => c.trim() !== '')) registros.push({ campos, linea: lineaInicio })
    campo = ''; campos = []; lineaInicio = linea + 1
  }
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (enComillas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else enComillas = false }
      else { campo += ch; if (ch === '\n') linea++ }
    } else if (ch === '"' && campo === '') enComillas = true // solo abre comillas al inicio del campo: 1/2" es texto normal
    else if (ch === sep) { campos.push(campo); campo = '' }
    else if (ch === '\n') { cerrarRegistro(); linea++; lineaInicio = linea }
    else campo += ch
  }
  const problemas: ProblemaCsv[] = []
  if (enComillas) problemas.push({ linea: lineaInicio, mensaje: 'Hay una comilla (") sin cerrar: el archivo puede estar truncado o mal escapado' })
  if (campo !== '' || campos.length) cerrarRegistro()
  if (registros.length === 0) return { encabezados: [], filas: [], problemas }

  const encabezados = registros[0].campos.map(h => h.trim().toLowerCase())
  const filas = registros.slice(1)
    // las filas que empiezan con # son comentarios de la plantilla
    .filter(r => !(r.campos[0] ?? '').trim().startsWith('#'))
    .map(r => {
      if (r.campos.length !== encabezados.length) problemas.push({ linea: r.linea, mensaje: `La fila tiene ${r.campos.length} columnas y el encabezado ${encabezados.length}: revisa comas o separadores dentro de un texto (usa comillas)` })
      const f: Record<string, string> = { __linea: String(r.linea) }
      encabezados.forEach((h, i) => { f[h] = (r.campos[i] ?? '').trim() })
      return f as Fila
    })
  return { encabezados, filas, problemas }
}

/**
 * Número con punto o coma decimal. Devuelve null si está vacío y NaN si no es válido.
 * Un separador de miles ambiguo ("1.500", "1,500") se rechaza: en Chile 1.500 = 1500 y en otras
 * convenciones 1.5; equivocarse cambiaría precios y stock en silencio. Escribe los números sin miles.
 */
export function aNumero(v: string | undefined): number | null {
  const s = (v ?? '').trim()
  if (s === '') return null
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) return NaN // 1.500 / 1,500 / 1.234.567: ambiguo
  let limpio = s
  if (s.includes('.') && s.includes(',')) limpio = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (s.includes(',')) limpio = s.replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : NaN
}

/** Fecha AAAA-MM-DD o DD-MM-AAAA (o con /). Devuelve UTC medianoche, como los formularios de la app. null si vacío, undefined si inválida. */
export function aFecha(v: string | undefined): Date | null | undefined {
  const s = (v ?? '').trim()
  if (s === '') return null
  let y: number, m: number, d: number
  let r = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s)
  if (r) { y = +r[1]; m = +r[2]; d = +r[3] }
  else {
    r = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s)
    if (!r) return undefined
    d = +r[1]; m = +r[2]; y = +r[3]
  }
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f : undefined
}
