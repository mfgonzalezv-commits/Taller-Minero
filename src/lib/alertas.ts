// Motor de alertas y escalamiento (solo notificaciones INTERNAS; correo y WhatsApp quedan para después).
// Lógica PURA: recibe una foto de los datos y la hora, y devuelve las alertas que corresponden.
// El guardado es idempotente por `claveUnica` (tipo + entidad + nivel), así que ejecutar el motor
// muchas veces no duplica nada.
//
// Alertas críticas cuentan tiempo CONTINUO; las administrativas, solo HORARIO LABORAL
// (supuesto inicial: lunes a viernes 08:00–18:00, hora de Chile; ajustable abajo).
export const ZONA_HORARIA = 'America/Santiago'
export const HORARIO_LABORAL = { horaInicio: 8, horaFin: 18, dias: [1, 2, 3, 4, 5] } // 1 = lunes

export type RolDestino = 'PLANIFICADOR' | 'JEFE_TALLER_CENTRAL' | 'PLANIFICADOR_CENTRAL' | 'GERENCIA'
type Modo = 'continuo' | 'laboral'
interface Paso { minutos: number; rol: RolDestino; recordatorio?: boolean }
export const REGLAS: Record<string, { modo: Modo; titulo: string; pasos: Paso[] }> = {
  hallazgo_critico: { modo: 'continuo', titulo: 'Hallazgo crítico / equipo detenido', pasos: [{ minutos: 0, rol: 'PLANIFICADOR' }, { minutos: 30, rol: 'JEFE_TALLER_CENTRAL' }, { minutos: 120, rol: 'PLANIFICADOR_CENTRAL' }] },
  ot_critica_sin_responsable: { modo: 'continuo', titulo: 'OT crítica sin responsable', pasos: [{ minutos: 0, rol: 'PLANIFICADOR' }, { minutos: 30, rol: 'JEFE_TALLER_CENTRAL' }] },
  ot_sin_movimiento: { modo: 'laboral', titulo: 'OT sin movimiento', pasos: [{ minutos: 4 * 60, rol: 'PLANIFICADOR' }, { minutos: 8 * 60, rol: 'JEFE_TALLER_CENTRAL' }, { minutos: 24 * 60, rol: 'PLANIFICADOR_CENTRAL' }] },
  reparacion_pendiente_validacion: { modo: 'continuo', titulo: 'Reparación pendiente de validación técnica', pasos: [{ minutos: 0, rol: 'JEFE_TALLER_CENTRAL' }, { minutos: 120, rol: 'JEFE_TALLER_CENTRAL', recordatorio: true }, { minutos: 240, rol: 'PLANIFICADOR_CENTRAL' }] },
  stock_critico_agotado: { modo: 'continuo', titulo: 'Stock crítico agotado', pasos: [{ minutos: 0, rol: 'PLANIFICADOR' }, { minutos: 60, rol: 'JEFE_TALLER_CENTRAL' }, { minutos: 240, rol: 'PLANIFICADOR_CENTRAL' }] },
  compra_pendiente_aprobacion: { modo: 'laboral', titulo: 'Compra pendiente de aprobación central', pasos: [{ minutos: 0, rol: 'JEFE_TALLER_CENTRAL' }, { minutos: 240, rol: 'JEFE_TALLER_CENTRAL', recordatorio: true }, { minutos: 480, rol: 'PLANIFICADOR_CENTRAL' }] },
}

export interface Evento { id: string; faenaId: string; desde: Date; detalle: string }
export interface SnapshotAlertas {
  ahora: Date
  hallazgosCriticos: Evento[]
  otsCriticasSinResponsable: Evento[]
  otsSinMovimiento: Evento[]
  reparacionesPendientesValidacion: Evento[]
  stockAgotado: Evento[]
  comprasPendientes: Evento[]
  /** Preventivos: restante en días u horas (negativo = vencido). */
  preventivos: { id: string; faenaId: string; detalle: string; diasRestantes: number | null; horasRestantes: number | null }[]
  /** Un registro por faena activa para el Estado de Pago del periodo en curso. */
  estadosPago: { faenaId: string; faenaNombre: string; periodoTermino: Date; hayPreparado: boolean; hayAprobado: boolean }[]
}

export interface AlertaGenerada { claveUnica: string; tipo: string; nivel: number; rolDestino: RolDestino; faenaId: string | null; titulo: string; mensaje: string; entidad: string; entidadId: string }

// ── Tiempo ────────────────────────────────────────────────────────────────────────────────────────
function partes(ms: number) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, dow: dias[p.weekday] }
}
function offsetMin(ms: number): number {
  const p = partes(ms)
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ms / 60000) * 60000) / 60000)
}
/** Instante UTC de una hora local de Chile. */
export function localAUtc(y: number, m: number, d: number, h: number, min = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, min)
  let utc = guess - offsetMin(guess) * 60000
  utc = guess - offsetMin(utc) * 60000
  return utc
}
export function fechaLocalChile(ms: number): { y: number; m: number; d: number; dow: number } {
  const p = partes(ms)
  return { y: p.y, m: p.m, d: p.d, dow: p.dow }
}

/** Minutos de horario laboral entre dos instantes (hasta 60 días). */
export function minutosLaborales(desde: Date, hasta: Date): number {
  if (hasta <= desde) return 0
  let total = 0
  let cursor = Math.max(desde.getTime(), hasta.getTime() - 60 * 86_400_000)
  const fin = hasta.getTime()
  while (cursor < fin) {
    const p = partes(cursor)
    const siguiente = localAUtc(p.y, p.m, p.d + 1, 0, 0)
    if (HORARIO_LABORAL.dias.includes(p.dow)) {
      const ini = Math.max(cursor, localAUtc(p.y, p.m, p.d, HORARIO_LABORAL.horaInicio)), fn = Math.min(fin, localAUtc(p.y, p.m, p.d, HORARIO_LABORAL.horaFin))
      if (fn > ini) total += (fn - ini) / 60000
    }
    if (siguiente <= cursor) break
    cursor = siguiente
  }
  return total
}

export function minutosTranscurridos(modo: Modo, desde: Date, ahora: Date): number {
  return modo === 'continuo' ? Math.max(0, (ahora.getTime() - desde.getTime()) / 60000) : minutosLaborales(desde, ahora)
}

// ── Reglas ────────────────────────────────────────────────────────────────────────────────────────
function escalar(tipo: string, e: Evento, ahora: Date, entidad: string): AlertaGenerada[] {
  const regla = REGLAS[tipo]
  const min = minutosTranscurridos(regla.modo, e.desde, ahora)
  return regla.pasos.flatMap((p, i) => min >= p.minutos ? [{
    claveUnica: `${tipo}:${e.id}:${i}`, tipo, nivel: i, rolDestino: p.rol, faenaId: e.faenaId, entidad, entidadId: e.id,
    titulo: `${p.recordatorio ? 'Recordatorio: ' : i > 0 ? 'Escalamiento: ' : ''}${regla.titulo}`,
    mensaje: `${e.detalle}${p.minutos ? ` — ${Math.floor(min)} min sin resolver` : ''}`,
  }] : [])
}

export function calcularAlertas(s: SnapshotAlertas): AlertaGenerada[] {
  const out: AlertaGenerada[] = []
  for (const e of s.hallazgosCriticos) out.push(...escalar('hallazgo_critico', e, s.ahora, 'ReporteFalla'))
  for (const e of s.otsCriticasSinResponsable) out.push(...escalar('ot_critica_sin_responsable', e, s.ahora, 'OrdenTrabajo'))
  for (const e of s.otsSinMovimiento) out.push(...escalar('ot_sin_movimiento', e, s.ahora, 'OrdenTrabajo'))
  for (const e of s.reparacionesPendientesValidacion) out.push(...escalar('reparacion_pendiente_validacion', e, s.ahora, 'OrdenTrabajo'))
  for (const e of s.stockAgotado) out.push(...escalar('stock_critico_agotado', e, s.ahora, 'ItemBodega'))
  for (const e of s.comprasPendientes) out.push(...escalar('compra_pendiente_aprobacion', e, s.ahora, 'SolicitudRepuesto'))

  // Preventivo: próximo (7 días o 50 horas antes, una vez) y vencido (una alerta por día).
  const hoy = fechaLocalChile(s.ahora.getTime()), claveDia = `${hoy.y}-${String(hoy.m).padStart(2, '0')}-${String(hoy.d).padStart(2, '0')}`
  for (const p of s.preventivos) {
    const vencido = (p.diasRestantes !== null && p.diasRestantes < 0) || (p.horasRestantes !== null && p.horasRestantes < 0)
    const proximo = !vencido && ((p.diasRestantes !== null && p.diasRestantes <= 7) || (p.horasRestantes !== null && p.horasRestantes <= 50))
    if (vencido) out.push({ claveUnica: `preventivo_vencido:${p.id}:${claveDia}`, tipo: 'preventivo_vencido', nivel: 0, rolDestino: 'PLANIFICADOR', faenaId: p.faenaId, entidad: 'PlanMantenimiento', entidadId: p.id, titulo: 'Preventivo VENCIDO', mensaje: p.detalle })
    else if (proximo) out.push({ claveUnica: `preventivo_proximo:${p.id}:0`, tipo: 'preventivo_proximo', nivel: 0, rolDestino: 'PLANIFICADOR', faenaId: p.faenaId, entidad: 'PlanMantenimiento', entidadId: p.id, titulo: 'Preventivo próximo', mensaje: p.detalle })
  }

  // Estado de Pago: 3 días antes del 25, el día 25 (Planificador Central) y atraso (Gerencia). Fecha de Chile.
  for (const ep of s.estadosPago) {
    if (ep.hayAprobado) continue
    const fin = fechaLocalChile(ep.periodoTermino.getTime()), diaFin = localAUtc(fin.y, fin.m, fin.d, 0)
    const hoyInicio = localAUtc(hoy.y, hoy.m, hoy.d, 0), dias = Math.round((diaFin - hoyInicio) / 86_400_000) // >0 faltan; 0 = hoy es el 25; <0 atraso
    const base = { faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: ep.faenaId }
    const periodo = `${fin.y}-${String(fin.m).padStart(2, '0')}`
    if (dias <= 3 && dias > 0 && !ep.hayPreparado) out.push({ ...base, claveUnica: `ep_antes:${ep.faenaId}:${periodo}`, tipo: 'ep_antes', nivel: 0, rolDestino: 'PLANIFICADOR_CENTRAL', titulo: 'Estado de Pago: faltan 3 días para el cierre', mensaje: `${ep.faenaNombre}: el periodo cierra el día ${fin.d}; aún no está preparado` })
    if (dias <= 0) out.push({ ...base, claveUnica: `ep_cierre:${ep.faenaId}:${periodo}`, tipo: 'ep_cierre', nivel: 1, rolDestino: 'PLANIFICADOR_CENTRAL', titulo: 'Estado de Pago: cierre del periodo', mensaje: `${ep.faenaNombre}: hoy vence el periodo y el Estado de Pago ${ep.hayPreparado ? 'no está aprobado' : 'no está preparado'}` })
    if (dias < 0) out.push({ ...base, claveUnica: `ep_atraso:${ep.faenaId}:${periodo}`, tipo: 'ep_atraso', nivel: 2, rolDestino: 'GERENCIA', titulo: 'Estado de Pago atrasado', mensaje: `${ep.faenaNombre}: el periodo venció hace ${-dias} día(s) sin aprobación` })
  }
  return out
}
