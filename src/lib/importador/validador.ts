// Validación PURA de las planillas de carga (sin base de datos): recibe lo leído de los CSV y una
// foto de lo que ya existe en la base, y devuelve el informe (nuevos, sin cambios, advertencias,
// errores) y el plan de inserción. El importador NUNCA actualiza ni borra: lo que ya existe y es
// idéntico se cuenta como "sin cambios"; si difiere es un conflicto (error) y no se toca.
import { aFecha, aNumero, type Fila } from './csv'

export const HOJAS = ['faenas', 'usuarios', 'equipos', 'asignaciones', 'items_bodega', 'lotes'] as const
export type Hoja = (typeof HOJAS)[number]

export const COLUMNAS: Record<Hoja, { requeridas: string[]; opcionales: string[] }> = {
  faenas: { requeridas: ['codigo', 'nombre'], opcionales: ['empresa', 'ubicacion'] },
  usuarios: { requeridas: ['email', 'nombre', 'rol', 'faena'], opcionales: ['password_temporal', 'especialidades', 'turno', 'tarifa_hora', 'tarifa_hora_extra'] },
  equipos: { requeridas: ['faena', 'codigo', 'nombre', 'tipo'], opcionales: ['marca', 'modelo', 'patente', 'anio', 'costo_hora_detencion', 'horometro_inicial'] },
  asignaciones: { requeridas: ['faena', 'equipo_codigo', 'fecha_inicio', 'modalidad', 'tarifa'], opcionales: ['fecha_termino', 'contrato', 'regla_descuento', 'politica_prorateo'] },
  items_bodega: { requeridas: ['faena', 'codigo', 'descripcion', 'stock_actual'], opcionales: ['unidad', 'stock_minimo', 'stock_maximo', 'criticidad', 'precio_ref', 'categoria'] },
  lotes: { requeridas: ['faena', 'item_codigo', 'lote_ref', 'cantidad', 'costo_unitario', 'fecha_recepcion'], opcionales: [] },
}

export const ROLES = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'GERENCIA', 'OPERADOR']
const ROLES_CENTRALES = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL']
const TIPOS_EQUIPO = ['CAMION', 'MAQUINARIA', 'LIVIANO', 'OTRO']
const MODALIDADES = ['HORA', 'DIA', 'MES']
const POLITICAS = ['DIAS_REALES', 'BASE_30']
const CRITICIDADES = ['BAJA', 'MEDIA', 'ALTA']
const TOLERANCIA = 0.005

export interface DatosPlanilla {
  encabezados: Partial<Record<Hoja, string[]>>
  faenas: Fila[]; usuarios: Fila[]; equipos: Fila[]; asignaciones: Fila[]; items_bodega: Fila[]; lotes: Fila[]
}

export interface Existente {
  faenas: Map<string, { nombre: string; empresa: string | null; ubicacion: string | null }>
  usuarios: Map<string, { nombre: string; rol: string; faena: string }>
  equipos: Map<string, { nombre: string; tipo: string; marca: string | null; modelo: string | null; patente: string | null; anio: number | null; costoHoraDetencion: number }>
  /** clave = faena|equipo_codigo */
  asignaciones: Map<string, { inicio: Date; fin: Date | null; modalidad: string | null; tarifa: number | null; regla: string | null; politica: string; contrato: string | null }[]>
  items: Map<string, { descripcion: string; unidad: string; stockActual: number; stockMinimo: number; precioRef: number; lotes: Map<string, { cantidad: number; costo: number; fecha: Date }> }>
}

export interface Mensaje { hoja: Hoja | 'general'; linea: number | null; mensaje: string }

export interface PlanUsuario { email: string; nombre: string; rol: string; passwordTemporal: string | null; especialidades: string[]; turno: string | null; tarifaHora: number; tarifaHoraExtra: number; linea: number }
export interface PlanEquipo { codigo: string; nombre: string; tipo: string; marca: string | null; modelo: string | null; patente: string | null; anio: number | null; costoHoraDetencion: number; horometroInicial: number; linea: number }
export interface PlanAsignacion { equipoCodigo: string; inicio: Date; fin: Date | null; contrato: string | null; modalidad: string; tarifa: number; regla: string | null; politica: string; linea: number }
export interface PlanLote { ref: string; cantidad: number; costo: number; fecha: Date; linea: number }
export interface PlanItem { codigo: string; descripcion: string; unidad: string; stockMinimo: number; stockMaximo: number | null; criticidad: string; precioRef: number; categoria: string | null; lotes: PlanLote[]; linea: number }
export interface Plan {
  faena: { codigo: string; nombre: string; empresa: string | null; ubicacion: string | null } | null // null = ya existe
  faenaCodigo: string
  usuarios: PlanUsuario[]; equipos: PlanEquipo[]; asignaciones: PlanAsignacion[]; items: PlanItem[]
}
export interface Informe {
  errores: Mensaje[]; advertencias: Mensaje[]
  nuevos: Record<Hoja, number>; sinCambios: Record<Hoja, number>
  plan: Plan | null
  stock: { items: number; lotesNuevos: number; unidades: number; valorizado: number }
}

const cero = (): Record<Hoja, number> => ({ faenas: 0, usuarios: 0, equipos: 0, asignaciones: 0, items_bodega: 0, lotes: 0 })
const num = (v: number | null | undefined) => (v == null ? 0 : v)
const iguales = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA
const mismoDia = (a: Date | null, b: Date | null) => (a === null || b === null ? a === b : a.getTime() === b.getTime())

export function validarCarga(d: DatosPlanilla, existente: Existente, faenaObjetivo: string, hoy: Date = new Date()): Informe {
  const errores: Mensaje[] = [], advertencias: Mensaje[] = []
  const error = (hoja: Mensaje['hoja'], f: Fila | null, mensaje: string) => errores.push({ hoja, linea: f ? +f.__linea : null, mensaje })
  const aviso = (hoja: Mensaje['hoja'], f: Fila | null, mensaje: string) => advertencias.push({ hoja, linea: f ? +f.__linea : null, mensaje })
  const nuevos = cero(), sinCambios = cero()
  const plan: Plan = { faena: null, faenaCodigo: faenaObjetivo, usuarios: [], equipos: [], asignaciones: [], items: [] }

  // ── Encabezados ────────────────────────────────────────────────────────────
  for (const h of HOJAS) {
    const enc = d.encabezados[h]
    if (!enc) { if (h !== 'lotes' && h !== 'asignaciones' && h !== 'items_bodega' && h !== 'faenas') error('general', null, `Falta la planilla ${h}.csv`); continue }
    for (const c of COLUMNAS[h].requeridas) if (!enc.includes(c)) error(h, null, `Falta la columna obligatoria "${c}"`)
    for (const c of enc) if (!COLUMNAS[h].requeridas.includes(c) && !COLUMNAS[h].opcionales.includes(c)) aviso(h, null, `Columna desconocida "${c}": se ignora`)
  }
  if (errores.length) return { errores, advertencias, nuevos, sinCambios, plan: null, stock: { items: 0, lotesNuevos: 0, unidades: 0, valorizado: 0 } }

  const enFaena = (hoja: Hoja, f: Fila) => {
    if (f.faena.toUpperCase() !== faenaObjetivo.toUpperCase()) { error(hoja, f, `La fila es de la faena "${f.faena}" pero esta carga es solo para "${faenaObjetivo}"`); return false }
    return true
  }
  const obligatorio = (hoja: Hoja, f: Fila, campos: string[]) => {
    let ok = true
    for (const c of campos) if (!f[c]) { error(hoja, f, `Falta el valor obligatorio "${c}"`); ok = false }
    return ok
  }
  const numero = (hoja: Hoja, f: Fila, campo: string, opts: { min?: number; estrictoMayorQue?: number; requerido?: boolean } = {}) => {
    const v = aNumero(f[campo])
    if (v === null) { if (opts.requerido) error(hoja, f, `Falta el número "${campo}"`); return null }
    if (Number.isNaN(v)) { error(hoja, f, `"${campo}" no es un número válido: "${f[campo]}"`); return null }
    if (opts.estrictoMayorQue !== undefined && !(v > opts.estrictoMayorQue)) { error(hoja, f, `"${campo}" debe ser mayor a ${opts.estrictoMayorQue} (valor: ${v})`); return null }
    if (opts.min !== undefined && v < opts.min) { error(hoja, f, `"${campo}" no puede ser negativo/menor a ${opts.min} (valor: ${v})`); return null }
    return v
  }

  // ── Faena ──────────────────────────────────────────────────────────────────
  const filasFaena = d.faenas.filter(f => f.codigo.toUpperCase() === faenaObjetivo.toUpperCase())
  for (const f of d.faenas) if (f.codigo.toUpperCase() !== faenaObjetivo.toUpperCase()) error('faenas', f, `La planilla incluye la faena "${f.codigo}"; esta carga es solo para "${faenaObjetivo}"`)
  if (filasFaena.length > 1) error('faenas', filasFaena[1], `Faena duplicada: ${faenaObjetivo}`)
  const exF = existente.faenas.get(faenaObjetivo.toUpperCase())
  if (filasFaena.length === 1) {
    const f = filasFaena[0]
    if (obligatorio('faenas', f, ['codigo', 'nombre'])) {
      if (exF) {
        if (exF.nombre === f.nombre) sinCambios.faenas++
        else error('faenas', f, `La faena ${faenaObjetivo} ya existe con otro nombre ("${exF.nombre}"); no se modifica`)
      } else { plan.faena = { codigo: faenaObjetivo.toUpperCase(), nombre: f.nombre, empresa: f.empresa || null, ubicacion: f.ubicacion || null }; nuevos.faenas++ }
    }
  } else if (!exF) error('faenas', null, `La faena ${faenaObjetivo} no existe en la base y no viene en faenas.csv`)

  // ── Usuarios ───────────────────────────────────────────────────────────────
  const emails = new Set<string>()
  for (const f of d.usuarios) {
    if (!enFaena('usuarios', f) || !obligatorio('usuarios', f, ['email', 'nombre', 'rol'])) continue
    const email = f.email.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error('usuarios', f, `Correo inválido: ${f.email}`); continue }
    if (emails.has(email)) { error('usuarios', f, `Correo duplicado en la planilla: ${email}`); continue }
    emails.add(email)
    const rol = f.rol.toUpperCase()
    if (!ROLES.includes(rol)) { error('usuarios', f, `Rol inválido "${f.rol}". Roles válidos: ${ROLES.join(', ')}`); continue }
    if (ROLES_CENTRALES.includes(rol)) aviso('usuarios', f, `${email} tiene rol central (${rol}): ve y opera todas las faenas. Confirma que corresponde`)
    if (f.password_temporal && f.password_temporal.length < 8) { error('usuarios', f, 'password_temporal debe tener al menos 8 caracteres (o déjala vacía para generar una)'); continue }
    const th = numero('usuarios', f, 'tarifa_hora', { min: 0 }), the = numero('usuarios', f, 'tarifa_hora_extra', { min: 0 })
    const ex = existente.usuarios.get(email)
    if (ex) {
      if (ex.rol === rol && ex.faena.toUpperCase() === faenaObjetivo.toUpperCase() && ex.nombre === f.nombre) sinCambios.usuarios++
      else error('usuarios', f, `El usuario ${email} ya existe (${ex.rol}, faena ${ex.faena}) y la planilla lo difiere; no se modifica. Ajústalo desde la aplicación`)
      continue
    }
    if (rol === 'MECANICO' && th === null) aviso('usuarios', f, `${email} es MECANICO sin tarifa_hora: sus horas se costearán en $0`)
    plan.usuarios.push({ email, nombre: f.nombre, rol, passwordTemporal: f.password_temporal || null, especialidades: (f.especialidades ?? '').split(/[|;]/).map(s => s.trim()).filter(Boolean), turno: f.turno || null, tarifaHora: num(th), tarifaHoraExtra: num(the), linea: +f.__linea })
    nuevos.usuarios++
  }
  const rolesFinales = new Set([...plan.usuarios.map(u => u.rol), ...[...existente.usuarios.values()].filter(u => u.faena.toUpperCase() === faenaObjetivo.toUpperCase()).map(u => u.rol)])
  if (!rolesFinales.has('JEFE_TALLER')) aviso('usuarios', null, 'La faena no tendrá ningún JEFE_TALLER')

  // ── Equipos ────────────────────────────────────────────────────────────────
  const codigosEquipo = new Set<string>()
  const anioMax = hoy.getUTCFullYear() + 1
  for (const f of d.equipos) {
    if (!enFaena('equipos', f) || !obligatorio('equipos', f, ['codigo', 'nombre', 'tipo'])) continue
    const codigo = f.codigo.toUpperCase()
    if (codigosEquipo.has(codigo)) { error('equipos', f, `Código de equipo duplicado: ${codigo}`); continue }
    codigosEquipo.add(codigo)
    const tipo = f.tipo.toUpperCase()
    if (!TIPOS_EQUIPO.includes(tipo)) { error('equipos', f, `Tipo inválido "${f.tipo}". Válidos: ${TIPOS_EQUIPO.join(', ')}`); continue }
    const anio = numero('equipos', f, 'anio', { min: 1950 })
    if (anio !== null && (anio > anioMax || !Number.isInteger(anio))) { error('equipos', f, `Año inválido: ${f.anio}`); continue }
    const costo = numero('equipos', f, 'costo_hora_detencion', { min: 0 })
    const horo = numero('equipos', f, 'horometro_inicial', { min: 0 })
    const ex = existente.equipos.get(`${faenaObjetivo.toUpperCase()}|${codigo}`)
    if (ex) {
      if (ex.nombre === f.nombre && ex.tipo === tipo && iguales(ex.costoHoraDetencion, num(costo))) sinCambios.equipos++
      else error('equipos', f, `El equipo ${codigo} ya existe y la planilla lo difiere; no se modifica`)
      continue
    }
    if (costo === null) aviso('equipos', f, `${codigo} sin costo_hora_detencion: el costo de detención quedará en $0`)
    plan.equipos.push({ codigo, nombre: f.nombre, tipo, marca: f.marca || null, modelo: f.modelo || null, patente: f.patente || null, anio: anio === null ? null : anio, costoHoraDetencion: num(costo), horometroInicial: num(horo), linea: +f.__linea })
    nuevos.equipos++
  }

  // ── Asignaciones (arriendo) ────────────────────────────────────────────────
  const porEquipo = new Map<string, { inicio: Date; fin: Date | null; linea: number | null }[]>()
  for (const [k, lista] of existente.asignaciones) if (k.startsWith(faenaObjetivo.toUpperCase() + '|')) porEquipo.set(k, lista.map(a => ({ inicio: a.inicio, fin: a.fin, linea: null })))
  for (const f of d.asignaciones) {
    if (!enFaena('asignaciones', f) || !obligatorio('asignaciones', f, ['equipo_codigo', 'fecha_inicio', 'modalidad'])) continue
    const eq = f.equipo_codigo.toUpperCase()
    if (!codigosEquipo.has(eq) && !existente.equipos.has(`${faenaObjetivo.toUpperCase()}|${eq}`)) { error('asignaciones', f, `El equipo ${eq} no existe (ni en equipos.csv ni en la base)`); continue }
    const ini = aFecha(f.fecha_inicio), fin = aFecha(f.fecha_termino)
    if (!ini) { error('asignaciones', f, `fecha_inicio inválida: "${f.fecha_inicio}" (usa AAAA-MM-DD)`); continue }
    if (fin === undefined) { error('asignaciones', f, `fecha_termino inválida: "${f.fecha_termino}"`); continue }
    if (fin && fin < ini) { error('asignaciones', f, 'fecha_termino es anterior a fecha_inicio'); continue }
    const modalidad = f.modalidad.toUpperCase()
    if (!MODALIDADES.includes(modalidad)) { error('asignaciones', f, `Modalidad inválida "${f.modalidad}". Válidas: ${MODALIDADES.join(', ')}`); continue }
    const tarifa = numero('asignaciones', f, 'tarifa', { estrictoMayorQue: 0, requerido: true })
    if (tarifa === null) continue
    const politica = (f.politica_prorateo || 'DIAS_REALES').toUpperCase()
    if (!POLITICAS.includes(politica)) { error('asignaciones', f, `politica_prorateo inválida "${f.politica_prorateo}". Válidas: ${POLITICAS.join(', ')}`); continue }
    if (f.regla_descuento && !(/^\d{1,3}(\.\d+)?%$/.test(f.regla_descuento) && parseFloat(f.regla_descuento) <= 100)) { error('asignaciones', f, `regla_descuento inválida "${f.regla_descuento}" (ejemplo: 100%)`); continue }
    if (!f.regla_descuento) aviso('asignaciones', f, `${eq}: sin regla_descuento, las detenciones no se descontarán en el Estado de Pago`)

    const clave = `${faenaObjetivo.toUpperCase()}|${eq}`
    const previas = porEquipo.get(clave) ?? []
    const idem = (existente.asignaciones.get(clave) ?? []).find(a => mismoDia(a.inicio, ini) && mismoDia(a.fin, fin ?? null))
    if (idem) {
      if (idem.modalidad === modalidad && iguales(num(idem.tarifa), tarifa) && idem.politica === politica) { sinCambios.asignaciones++; continue }
      error('asignaciones', f, `Ya existe una asignación de ${eq} con esas fechas y otra tarifa/modalidad; no se modifica`); continue
    }
    const solapa = previas.find(p => ini.getTime() <= (p.fin?.getTime() ?? Infinity) && (fin?.getTime() ?? Infinity) >= p.inicio.getTime())
    if (solapa) { error('asignaciones', f, `La asignación de ${eq} se solapa con otra${solapa.linea ? ` (línea ${solapa.linea})` : ' ya registrada'}`); continue }
    previas.push({ inicio: ini, fin: fin ?? null, linea: +f.__linea })
    porEquipo.set(clave, previas)
    plan.asignaciones.push({ equipoCodigo: eq, inicio: ini, fin: fin ?? null, contrato: f.contrato || null, modalidad, tarifa, regla: f.regla_descuento || null, politica, linea: +f.__linea })
    nuevos.asignaciones++
  }

  // ── Bodega: ítems y lotes ──────────────────────────────────────────────────
  const lotesPorItem = new Map<string, { f: Fila; ref: string; cantidad: number; costo: number; fecha: Date }[]>()
  const refsVistas = new Set<string>()
  for (const f of d.lotes) {
    if (!enFaena('lotes', f) || !obligatorio('lotes', f, ['item_codigo', 'lote_ref'])) continue
    const ic = f.item_codigo.toUpperCase()
    const cantidad = numero('lotes', f, 'cantidad', { estrictoMayorQue: 0, requerido: true })
    const costo = numero('lotes', f, 'costo_unitario', { min: 0, requerido: true })
    const fecha = aFecha(f.fecha_recepcion)
    if (!fecha) { error('lotes', f, `fecha_recepcion inválida o vacía: "${f.fecha_recepcion}"`); continue }
    if (fecha.getTime() > hoy.getTime()) { error('lotes', f, `fecha_recepcion está en el futuro: ${f.fecha_recepcion}`); continue }
    if (cantidad === null || costo === null) continue
    const llave = `${ic}|${f.lote_ref}`
    if (refsVistas.has(llave)) { error('lotes', f, `Lote duplicado: ${ic} / ${f.lote_ref}`); continue }
    refsVistas.add(llave)
    if (costo === 0) aviso('lotes', f, `${ic} / ${f.lote_ref}: costo_unitario 0`)
    const lista = lotesPorItem.get(ic) ?? []
    lista.push({ f, ref: f.lote_ref, cantidad, costo, fecha })
    lotesPorItem.set(ic, lista)
  }

  const codigosItem = new Set<string>()
  let lotesNuevos = 0, unidades = 0, valorizado = 0
  for (const f of d.items_bodega) {
    if (!enFaena('items_bodega', f) || !obligatorio('items_bodega', f, ['codigo', 'descripcion'])) continue
    const codigo = f.codigo.toUpperCase()
    if (codigosItem.has(codigo)) { error('items_bodega', f, `Código de ítem duplicado: ${codigo}`); continue }
    codigosItem.add(codigo)
    const stock = numero('items_bodega', f, 'stock_actual', { min: 0, requerido: true })
    const minimo = numero('items_bodega', f, 'stock_minimo', { min: 0 }), maximo = numero('items_bodega', f, 'stock_maximo', { min: 0 })
    const precio = numero('items_bodega', f, 'precio_ref', { min: 0 })
    const crit = (f.criticidad || 'MEDIA').toUpperCase()
    if (!CRITICIDADES.includes(crit)) { error('items_bodega', f, `criticidad inválida "${f.criticidad}". Válidas: ${CRITICIDADES.join(', ')}`); continue }
    if (stock === null) continue
    if (maximo !== null && minimo !== null && maximo < minimo) { error('items_bodega', f, 'stock_maximo es menor que stock_minimo'); continue }
    const lotes = lotesPorItem.get(codigo) ?? []
    const suma = lotes.reduce((a, l) => a + l.cantidad, 0)
    const ex = existente.items.get(`${faenaObjetivo.toUpperCase()}|${codigo}`)

    if (ex) {
      // El ítem ya existe: no se le agregan lotes en esta carga (alteraría su stock). Debe coincidir exactamente.
      const nuevosLotes = lotes.filter(l => !ex.lotes.has(l.ref))
      if (nuevosLotes.length) { error('items_bodega', f, `El ítem ${codigo} ya existe: los lotes ${nuevosLotes.map(l => l.ref).join(', ')} no se agregan en una carga inicial (usa un movimiento de entrada en la aplicación)`); continue }
      const distintos = lotes.filter(l => { const e = ex.lotes.get(l.ref)!; return !iguales(e.cantidad, l.cantidad) || !iguales(e.costo, l.costo) })
      if (distintos.length) { error('lotes', distintos[0].f, `El lote ${codigo}/${distintos[0].ref} ya existe con otra cantidad o costo; no se modifica`); continue }
      if (ex.descripcion === f.descripcion) { sinCambios.items_bodega++; sinCambios.lotes += lotes.length } else error('items_bodega', f, `El ítem ${codigo} ya existe con otra descripción; no se modifica`)
      continue
    }

    // Regla central: todo stock inicial debe tener lotes y el stock debe ser igual a la suma de lotes.
    if (stock > 0 && lotes.length === 0) { error('items_bodega', f, `El ítem ${codigo} tiene stock_actual ${stock} pero ningún lote en lotes.csv (todo stock inicial necesita lotes con cantidad, costo y fecha)`); continue }
    if (stock === 0 && lotes.length) { error('items_bodega', f, `El ítem ${codigo} declara stock 0 pero tiene lotes`); continue }
    if (!iguales(stock, suma)) { error('items_bodega', f, `stock_actual (${stock}) no coincide con la suma de sus lotes (${suma}) en el ítem ${codigo}`); continue }
    if (precio === null) aviso('items_bodega', f, `${codigo} sin precio_ref`)
    if (minimo !== null && stock < minimo) aviso('items_bodega', f, `${codigo} parte bajo su stock mínimo (${stock} < ${minimo})`)
    if (precio && lotes.some(l => l.costo > precio * 3 || l.costo < precio / 3)) aviso('items_bodega', f, `${codigo}: el costo de algún lote difiere más de 3 veces del precio_ref`)
    plan.items.push({ codigo, descripcion: f.descripcion, unidad: f.unidad || 'un', stockMinimo: num(minimo), stockMaximo: maximo, criticidad: crit, precioRef: num(precio), categoria: f.categoria || null, lotes: lotes.map(l => ({ ref: l.ref, cantidad: l.cantidad, costo: l.costo, fecha: l.fecha, linea: +l.f.__linea })), linea: +f.__linea })
    nuevos.items_bodega++; nuevos.lotes += lotes.length
    lotesNuevos += lotes.length; unidades += suma; valorizado += lotes.reduce((a, l) => a + l.cantidad * l.costo, 0)
  }
  for (const [ic, lotes] of lotesPorItem) {
    if (!codigosItem.has(ic)) error('lotes', lotes[0].f, `Los lotes de "${ic}" no tienen ítem en items_bodega.csv`)
  }

  const conError = errores.length > 0
  return { errores, advertencias, nuevos, sinCambios, plan: conError ? null : plan, stock: { items: plan.items.length, lotesNuevos, unidades, valorizado } }
}

/** Texto del informe (para pantalla y para archivo). */
export function informeATexto(i: Informe, ctx: { faena: string; base: string; modo: string }): string {
  const L: string[] = []
  L.push(`# Informe de carga — faena ${ctx.faena} — base "${ctx.base}" — modo ${ctx.modo}`, '')
  L.push('| Planilla | Nuevos | Sin cambios |', '|---|---:|---:|')
  for (const h of HOJAS) L.push(`| ${h} | ${i.nuevos[h]} | ${i.sinCambios[h]} |`)
  L.push('', `Stock inicial a cargar: ${i.stock.items} ítems, ${i.stock.lotesNuevos} lotes, ${i.stock.unidades} unidades, valorizado $${Math.round(i.stock.valorizado).toLocaleString('es-CL')}`)
  L.push('', `## Errores (${i.errores.length})`, ...(i.errores.length ? i.errores.map(m => `- [${m.hoja}${m.linea ? ` línea ${m.linea}` : ''}] ${m.mensaje}`) : ['Ninguno']))
  L.push('', `## Advertencias (${i.advertencias.length})`, ...(i.advertencias.length ? i.advertencias.map(m => `- [${m.hoja}${m.linea ? ` línea ${m.linea}` : ''}] ${m.mensaje}`) : ['Ninguna']))
  L.push('', i.errores.length ? '**Resultado: NO se puede cargar. Corrige los errores.**' : '**Resultado: listo para cargar (`--apply`).**')
  return L.join('\n')
}
