// Generador PURO (sin Prisma, sin base de datos) del escenario ficticio SIM-01
// de 3 meses de operación. Lo usa scripts/simulacion-tres-meses.ts para
// cargar erp_minera_dev y tests/simulacion-sim01.test.ts para verificar sus
// invariantes sin tocar ninguna base.
//
// IMPORTANTE: este módulo CREA el escenario y calcula el resultado
// ESPERADO (con la regla correcta de detención: intervalos recortados al
// periodo y unidos). NO ejecuta los procesos reales de Taller Minero: la
// auditoría posterior es la que corre prepararEstadoPago() y compara.
import { createHash } from 'crypto'
import { calcularPeriodo } from './periodo-pago'
import { calcularLineaArriendo } from './calculo-estado-pago'

export const SIM_FAENA_CODIGO = 'SIM-01'
export const SIM_SEED = 20260918
export const DIA_MS = 86_400_000
export const HORA_MS = 3_600_000
export const SIM_INICIO = () => new Date(2026, 5, 26, 0, 0, 0)
export const SIM_DIAS = 92 // 26-jun .. 25-sep

type Row = Record<string, unknown>

// ── Intervalos de detención ─────────────────────────────────────────────────
export interface Intervalo { ini: Date; fin: Date }

export function recortarIntervalo(i: Intervalo, ini: Date, fin: Date): Intervalo | null {
  const a = Math.max(i.ini.getTime(), ini.getTime())
  const b = Math.min(i.fin.getTime(), fin.getTime())
  return b > a ? { ini: new Date(a), fin: new Date(b) } : null
}

/** Une intervalos que se superponen o se tocan, para no contar dos veces el mismo tiempo. */
export function unirIntervalos(is: Intervalo[]): Intervalo[] {
  const orden = [...is].sort((x, y) => x.ini.getTime() - y.ini.getTime())
  const out: Intervalo[] = []
  for (const i of orden) {
    const ult = out[out.length - 1]
    if (ult && i.ini.getTime() <= ult.fin.getTime()) {
      if (i.fin.getTime() > ult.fin.getTime()) ult.fin = new Date(i.fin.getTime())
    } else out.push({ ini: new Date(i.ini.getTime()), fin: new Date(i.fin.getTime()) })
  }
  return out
}

/** Minutos de detención dentro de [ini, fin]: cada ventana se recorta a los límites y luego se unen. */
export function minutosDetencionEnPeriodo(ventanas: Intervalo[], ini: Date, fin: Date): number {
  const recortadas = ventanas.map(v => recortarIntervalo(v, ini, fin)).filter((x): x is Intervalo => x !== null)
  return unirIntervalos(recortadas).reduce((a, i) => a + (i.fin.getTime() - i.ini.getTime()) / 60_000, 0)
}

// ── Horómetro ───────────────────────────────────────────────────────────────
export interface Lectura { fecha: Date; horometro: number }

/** Delta del periodo = última lectura - primera lectura dentro de [inicio, termino] (igual que prepararEstadoPago). */
export function deltaHorometro(lecturas: Lectura[], inicio: Date, termino: Date): number {
  const enPeriodo = lecturas
    .filter(l => l.fecha.getTime() >= inicio.getTime() && l.fecha.getTime() <= termino.getTime())
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  if (enPeriodo.length < 2) return 0
  return Math.max(0, enPeriodo[enPeriodo.length - 1].horometro - enPeriodo[0].horometro)
}

/**
 * Una lectura diaria (18:00). El horómetro NO avanza durante las horas en que
 * el equipo está detenido: el avance del día se reduce proporcionalmente a la
 * fracción del día cubierta por ventanas de detención (un día completo detenido = 0).
 */
export function generarLecturas(p: { horom0: number; inicio: Date; dias: number; ventanas: Intervalo[]; rnd: () => number }): Lectura[] {
  const out: Lectura[] = []
  let h = p.horom0
  for (let d = 0; d <= p.dias; d++) {
    const diaIni = new Date(p.inicio.getTime() + d * DIA_MS)
    const diaFin = new Date(diaIni.getTime() + DIA_MS)
    const base = 6 + p.rnd() * 8 // 6-14 h de jornada; siempre se consume un número para mantener la secuencia
    const detMin = minutosDetencionEnPeriodo(p.ventanas, diaIni, diaFin)
    h += base * (1 - Math.min(1, detMin / 1440))
    out.push({ fecha: new Date(diaIni.getTime() + 18 * HORA_MS), horometro: Number(h.toFixed(1)) })
  }
  return out
}

// ── Bodega: libro cronológico de entradas y salidas FIFO ───────────────────
export interface LoteIn { id: string; itemId: string; cantidad: number; costo: number; fecha: Date }
export interface SalidaReq { ref: string; itemId: string; cantidad: number; fecha: Date; otId: string }
export interface MovimientoOut { id: string; itemId: string; tipo: 'ENTRADA' | 'SALIDA'; cantidad: number; stockAntes: number; stockDespues: number; fecha: Date; otId: string | null; loteId?: string }
export interface ConsumoOut { id: string; loteId: string; movimientoId: string; cantidad: number; costoUnitario: number }

export function procesarBodega(lotes: LoteIn[], salidas: SalidaReq[], nuevoId: () => string) {
  type Ev = { fecha: number; orden: number; idx: number; lote?: LoteIn; sal?: SalidaReq }
  const eventos: Ev[] = [
    ...lotes.map((l, i) => ({ fecha: l.fecha.getTime(), orden: 0, idx: i, lote: l })),
    ...salidas.map((s, i) => ({ fecha: s.fecha.getTime(), orden: 1, idx: i, sal: s })),
  ].sort((a, b) => a.fecha - b.fecha || a.orden - b.orden || a.idx - b.idx)

  const saldo = new Map(lotes.map(l => [l.id, l.cantidad]))
  const stock = new Map<string, number>()
  const movimientos: MovimientoOut[] = []
  const consumos: ConsumoOut[] = []
  const costoPorRef = new Map<string, number>()

  for (const ev of eventos) {
    if (ev.lote) {
      const l = ev.lote
      const antes = stock.get(l.itemId) ?? 0
      stock.set(l.itemId, antes + l.cantidad)
      movimientos.push({ id: nuevoId(), itemId: l.itemId, tipo: 'ENTRADA', cantidad: l.cantidad, stockAntes: antes, stockDespues: antes + l.cantidad, fecha: l.fecha, otId: null, loteId: l.id })
    } else {
      const s = ev.sal!
      const antes = stock.get(s.itemId) ?? 0
      if (antes < s.cantidad) throw new Error(`Simulación: stock insuficiente en ${s.itemId} el ${s.fecha.toISOString()}`)
      const movId = nuevoId()
      let restante = s.cantidad, costoTotal = 0
      const disp = lotes.filter(l => l.itemId === s.itemId && l.fecha.getTime() <= s.fecha.getTime() && (saldo.get(l.id) ?? 0) > 0)
        .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
      for (const l of disp) {
        if (restante <= 0) break
        const t = Math.min(saldo.get(l.id)!, restante)
        saldo.set(l.id, saldo.get(l.id)! - t); restante -= t; costoTotal += t * l.costo
        consumos.push({ id: nuevoId(), loteId: l.id, movimientoId: movId, cantidad: t, costoUnitario: l.costo })
      }
      if (restante > 1e-9) throw new Error(`Simulación: lotes insuficientes en ${s.itemId}`)
      stock.set(s.itemId, antes - s.cantidad)
      movimientos.push({ id: movId, itemId: s.itemId, tipo: 'SALIDA', cantidad: s.cantidad, stockAntes: antes, stockDespues: antes - s.cantidad, fecha: s.fecha, otId: s.otId })
      costoPorRef.set(s.ref, costoTotal)
    }
  }
  return { movimientos, consumos, saldo, stock, costoPorRef }
}

// ── Limpieza exclusiva de la faena SIM-01 ──────────────────────────────────
export interface PasoLimpieza { modelo: string; where: Record<string, unknown> }
/** Orden de borrado (hijos antes que padres). TODO paso queda acotado a la faena. */
export function planLimpieza(faenaId: string): PasoLimpieza[] {
  const w = { faenaId }
  return [
    { modelo: 'estadoPagoLinea', where: { estadoPago: w } },
    { modelo: 'estadoPago', where: w },
    { modelo: 'consumoLoteBodega', where: { lote: { item: w } } },
    { modelo: 'movimientoBodega', where: w },
    { modelo: 'repuestoOT', where: w },
    { modelo: 'manoObraOT', where: w },
    { modelo: 'reporteFalla', where: w },
    { modelo: 'historialEstadoOT', where: w },
    { modelo: 'ordenTrabajo', where: w },
    { modelo: 'horometroKm', where: w },
    { modelo: 'loteBodega', where: { item: w } },
    { modelo: 'itemBodega', where: w },
    { modelo: 'asignacionEquipoFaena', where: w },
    { modelo: 'equipo', where: w },
    { modelo: 'tecnico', where: w },
    { modelo: 'trabajador', where: w },
    { modelo: 'usuario', where: w },
  ]
}

// ── Escenario completo ─────────────────────────────────────────────────────
export interface LineaEsperada {
  codigo: string; modalidad: string; politica: string; diasVigentes: number; horasTrabajadas: number
  minutosDetencion: number; horasDetencion: number; cantidadUnidades: number
  montoBruto: number; descuentoDetencion: number; montoNeto: number
  /** Lo que producirá prepararEstadoPago() con su regla ACTUAL (suma completa de tiempoDetenidoMin de cada OT que cruza el periodo). */
  horasDetencionLogicaActual: number
}
export interface PeriodoEsperado {
  periodo: number; inicio: Date; termino: Date; diasPeriodo: number
  lineas: LineaEsperada[]; totalBruto: number; totalDescuentos: number; totalNeto: number
}

export function generarEscenario(passwordHash: string) {
  let estado = SIM_SEED
  const rnd = (): number => {
    estado |= 0; estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const entre = (a: number, b: number) => a + rnd() * (b - a)
  const entero = (a: number, b: number) => Math.floor(entre(a, b + 1))
  const elegir = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
  let contador = 0
  const id = (): string => {
    const h = createHash('md5').update(`${SIM_SEED}:${contador++}`).digest('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
  }
  const INICIO = SIM_INICIO()
  const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS)
  const sumarHoras = (d: Date, h: number) => new Date(d.getTime() + h * HORA_MS)
  const cierreSim = sumarDias(INICIO, SIM_DIAS)
  const faenaId = id()

  // Personas
  const roles = [
    ['admin', 'ADMINISTRADOR'], ['jefe', 'JEFE_TALLER'], ['planificador', 'PLANIFICADOR'],
    ['gerencia', 'GERENCIA'], ['bodega', 'BODEGA'], ['compras', 'COMPRAS'],
    ['mecanico1', 'MECANICO'], ['mecanico2', 'MECANICO'], ['mecanico3', 'MECANICO'],
  ] as const
  const usuarios = roles.map(([u, rol]) => ({ id: id(), faenaId, nombre: `Sim ${u}`, email: `${u}@sim.local`, password: passwordHash, rol }))
  const uPor = (rol: string) => usuarios.find(u => u.rol === rol)!
  const tecnicos = usuarios.filter(u => u.rol === 'MECANICO').map(m => ({
    id: id(), usuarioId: m.id, faenaId, especialidades: ['Motor', 'Hidráulica'], turno: 'Día', tarifaHora: 9000, tarifaHoraExtra: 13500,
  }))
  const trabajadores = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: id(), faenaId, nombre: `Trabajador directo ${i + 1}`, tipo: 'DIRECTO' as const, cargo: 'Mecánico general', sueldoBruto: 900_000 + i * 50_000, horasMensuales: 180, tasaLeyesSociales: 0.28 })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: id(), faenaId, nombre: `Trabajador indirecto ${i + 1}`, tipo: 'INDIRECTO' as const, cargo: 'Supervisor', sueldoBruto: 1_400_000, horasMensuales: 180, tasaLeyesSociales: 0.28 })),
  ]
  const costoHoraTrab = (t: typeof trabajadores[number]) => (t.sueldoBruto * (1 + t.tasaLeyesSociales)) / t.horasMensuales
  const directos = trabajadores.filter(t => t.tipo === 'DIRECTO')
  const tasaOverhead = trabajadores.filter(t => t.tipo === 'INDIRECTO').reduce((a, t) => a + t.sueldoBruto * (1 + t.tasaLeyesSociales), 0) / directos.reduce((a, t) => a + t.horasMensuales, 0)

  // Equipos y contratos de arriendo
  const defs: { pref: string; nombre: string; tipo: 'CAMION' | 'MAQUINARIA' | 'LIVIANO'; n: number; costoHora: number; modalidad: 'HORA' | 'DIA' | 'MES'; tarifa: number }[] = [
    { pref: 'SIM-CAM', nombre: 'Camión tolva', tipo: 'CAMION', n: 5, costoHora: 60_000, modalidad: 'MES', tarifa: 9_000_000 },
    { pref: 'SIM-MAQ', nombre: 'Excavadora', tipo: 'MAQUINARIA', n: 4, costoHora: 90_000, modalidad: 'HORA', tarifa: 65_000 },
    { pref: 'SIM-LIV', nombre: 'Camioneta', tipo: 'LIVIANO', n: 3, costoHora: 15_000, modalidad: 'DIA', tarifa: 80_000 },
  ]
  const equipos = defs.flatMap(d => Array.from({ length: d.n }, (_, i) => ({
    id: id(), faenaId, codigo: `${d.pref}-${String(i + 1).padStart(2, '0')}`, nombre: `${d.nombre} ${i + 1}`, tipo: d.tipo,
    marca: 'Sim', modelo: `M${i + 1}`, costoHoraDetencion: d.costoHora, modalidad: d.modalidad, tarifa: d.tarifa, horom0: entero(1000, 6000),
    inicioAsig: i === d.n - 1 ? sumarDias(INICIO, entero(5, 15)) : INICIO, // el último entra a mitad del 1er periodo (prorrateo parcial)
    politica: (i % 2 === 0 ? 'DIAS_REALES' : 'BASE_30') as 'DIAS_REALES' | 'BASE_30',
  })))
  const eqPorCodigo = (c: string) => equipos.find(e => e.codigo === c)!
  const asignaciones = equipos.map(e => ({
    id: id(), equipoId: e.id, faenaId, fechaInicio: e.inicioAsig, motivo: 'Simulación: contrato de arriendo',
    usuarioResponsableId: uPor('ADMINISTRADOR').id, contrato: `SIM-${e.codigo}`, modalidadArriendo: e.modalidad,
    tarifa: e.tarifa, reglaDescuentoDetencion: '100%', politicaProrateo: e.politica,
  }))

  // Bodega: ítems y lotes (inicial + reposiciones)
  const items = Array.from({ length: 15 }, (_, i) => ({
    id: id(), faenaId, codigo: `SIM-ITM-${String(i + 1).padStart(3, '0')}`, descripcion: `Repuesto simulado ${i + 1}`,
    unidad: 'un', stockMinimo: 5, precioRef: 20_000 + i * 15_000, categoria: i % 3 === 0 ? 'Filtros' : 'Repuestos',
  }))
  const lotesIn: LoteIn[] = []
  for (const it of items) {
    lotesIn.push({ id: id(), itemId: it.id, cantidad: 40, costo: it.precioRef, fecha: sumarDias(INICIO, -1) })
    for (let d = 20; d < SIM_DIAS; d += 21) lotesIn.push({ id: id(), itemId: it.id, cantidad: 30, costo: Math.round(it.precioRef * entre(1.02, 1.12)), fecha: sumarDias(INICIO, d) })
  }

  // Órdenes de trabajo: aleatorias (semilla fija) + casos deterministas
  interface Spec {
    eq: typeof equipos[number]; creada: Date; preventiva: boolean; durDiag: number; gapRep: number; durRep: number
    espera: number; durVal: number; extraCierre: number; mec: typeof tecnicos[number]; nRepuestos?: number; descripcion?: string
  }
  const specs: Spec[] = []
  const NOTS = 60
  for (let n = 0; n < NOTS; n++) {
    const eq = elegir(equipos)
    const creada = n >= NOTS - 6 ? sumarHoras(sumarDias(INICIO, SIM_DIAS - 1), -entero(2, 30)) : sumarHoras(sumarDias(INICIO, entero(0, SIM_DIAS - 6)), entero(6, 16))
    const preventiva = rnd() < 0.25
    const durDiag = entre(1, 6), durRep = entre(3, 30), durVal = entre(0.5, 3)
    const espera = rnd() < 0.3 ? entre(8, 60) : 0
    const gapRep = entre(0.5, 4), extraCierre = entre(1, 20)
    specs.push({ eq, creada, preventiva, durDiag, gapRep, durRep, espera, durVal, extraCierre, mec: elegir(tecnicos) })
  }
  // Casos deterministas (detención total = durDiag 2h + gap 1h + durRep). Sin espera de repuesto.
  const det = (codigo: string, y: number, m: number, d: number, h: number, horasTotales: number, desc: string): Spec => ({
    eq: eqPorCodigo(codigo), creada: new Date(y, m - 1, d, h, 0, 0), preventiva: false, durDiag: 2, gapRep: 1, durRep: horasTotales - 3,
    espera: 0, durVal: 1, extraCierre: 2, mec: tecnicos[0], nRepuestos: 1, descripcion: desc,
  })
  const deterministas: Spec[] = [
    det('SIM-CAM-01', 2026, 7, 25, 20, 12, 'Caso: cruza 25/26 jul (12 h: 4 en periodo 1, 8 en periodo 2)'),
    det('SIM-LIV-01', 2026, 8, 10, 8, 12, 'Caso: OT simultánea A (10-ago 08:00 a 20:00)'),
    det('SIM-LIV-01', 2026, 8, 10, 14, 16, 'Caso: OT simultánea B, se superpone con A (10-ago 14:00 a 11-ago 06:00)'),
    det('SIM-CAM-02', 2026, 8, 25, 22, 12, 'Caso: cruza 25/26 ago (12 h: 2 en periodo 2, 10 en periodo 3)'),
    det('SIM-CAM-03', 2026, 8, 25, 18, 18, 'Caso: cruza 25/26 ago y se superpone con la siguiente (a)'),
    det('SIM-CAM-03', 2026, 8, 26, 6, 12, 'Caso: simultánea con la anterior en periodo 3 (b)'),
    det('SIM-MAQ-01', 2026, 9, 2, 8, 12, 'Caso HORA: detención de 12 h dentro del periodo 3'),
    det('SIM-MAQ-02', 2026, 8, 2, 0, 72, 'Caso HORA: 3 días completos detenido (horómetro sin avance)'),
  ]
  specs.push(...deterministas)

  const descripciones = ['Fuga de aceite hidráulico', 'Ruido anormal en motor', 'Falla eléctrica en tablero', 'Cambio de neumático', 'Recalentamiento', 'Pérdida de potencia', 'Falla de frenos', 'Mantención preventiva']
  const ots: Row[] = [], historial: Row[] = [], manoObra: Row[] = [], reportes: Row[] = []
  const ventanasPorEquipo = new Map<string, Intervalo[]>()
  const otVentanas: { equipoId: string; creada: Date; fechaTerminoTrabajo: Date | null; tiempoDetenidoMin: number }[] = []
  const reqSalidas: (SalidaReq & { itemDesc: string })[] = []
  const repuestoIdPorRef = new Map<string, string>()

  for (const s of specs) {
    const { eq, creada, preventiva } = s
    const otId = id()
    const tDiag = sumarHoras(creada, s.durDiag)
    const tRepIni = sumarHoras(tDiag, s.gapRep)
    const tEspera = s.espera ? sumarHoras(tRepIni, s.durRep * 0.4) : null
    const tRepFin = sumarHoras(tEspera ? sumarHoras(tEspera, s.espera) : tRepIni, s.durRep * (s.espera ? 0.6 : 1))
    const tVal = sumarHoras(tRepFin, s.durVal)
    const tCierre = sumarHoras(tVal, s.extraCierre)
    let estadoFinal: 'CERRADA' | 'EN_REPARACION' | 'EN_DIAGNOSTICO' = 'CERRADA'
    if (tCierre > cierreSim) estadoFinal = tRepFin > cierreSim ? (tRepIni > cierreSim ? 'EN_DIAGNOSTICO' : 'EN_REPARACION') : 'EN_REPARACION'
    const cerrada = estadoFinal === 'CERRADA'

    const pasos: [string | null, string, Date][] = [[null, 'ABIERTA', creada], ['ABIERTA', 'EN_DIAGNOSTICO', sumarHoras(creada, 0.3)]]
    if (tDiag <= cierreSim) pasos.push(['EN_DIAGNOSTICO', 'DIAGNOSTICADO', tDiag])
    if (tRepIni <= cierreSim) pasos.push(['DIAGNOSTICADO', 'EN_REPARACION', tRepIni])
    if (tEspera && tEspera <= cierreSim) {
      pasos.push(['EN_REPARACION', 'ESPERA_REPUESTO', tEspera])
      const b = sumarHoras(tEspera, s.espera)
      if (b <= cierreSim) { pasos.push(['ESPERA_REPUESTO', 'LISTO_PARA_REPARAR', b]); pasos.push(['LISTO_PARA_REPARAR', 'EN_REPARACION', sumarHoras(b, 0.5)]) }
    }
    if (cerrada) { pasos.push(['EN_REPARACION', 'EN_VALIDACION', tRepFin]); pasos.push(['EN_VALIDACION', 'CERRADA', tCierre]) }
    let prevT = creada
    for (const [ant, nuevo, t] of pasos) {
      historial.push({ id: id(), otId, faenaId, estadoAnterior: ant, estadoNuevo: nuevo, fechaCambio: t, usuarioId: uPor('JEFE_TALLER').id, observacion: 'Simulación', tiempoEnEstadoMin: Math.round((t.getTime() - prevT.getTime()) / 60000) })
      prevT = t
    }
    const ultimoEstado = cerrada ? 'CERRADA' : pasos[pasos.length - 1][1]

    // Detención: desde la creación hasta el término técnico del trabajo (o hasta el cierre de la simulación si sigue abierta)
    const finTecnico = cerrada ? tRepFin : cierreSim
    const detMin = Math.max(0, Math.round((finTecnico.getTime() - creada.getTime()) / 60000))
    ventanasPorEquipo.set(eq.id, [...(ventanasPorEquipo.get(eq.id) ?? []), { ini: creada, fin: finTecnico }])
    otVentanas.push({ equipoId: eq.id, creada, fechaTerminoTrabajo: cerrada ? tRepFin : null, tiempoDetenidoMin: detMin })

    // Solicitudes de repuesto (se resuelven en orden cronológico más abajo)
    if (cerrada) {
      const n = s.nRepuestos ?? entero(0, 3)
      for (let k = 0; k < n; k++) {
        const it = elegir(items), cant = entero(1, 4), ref = id()
        repuestoIdPorRef.set(ref, otId)
        reqSalidas.push({ ref, itemId: it.id, cantidad: cant, fecha: tDiag, otId, itemDesc: it.descripcion })
      }
    }
    let totalMO = 0, horasDirectasOT = 0
    if (cerrada || estadoFinal === 'EN_REPARACION') {
      for (let k = 0; k < entero(1, 2); k++) {
        const t = elegir(directos), hN = Number(entre(2, 10).toFixed(1)), hE = rnd() < 0.3 ? Number(entre(1, 3).toFixed(1)) : 0
        const tarN = Math.round(costoHoraTrab(t)), tarE = Math.round(tarN * 1.5), total = hN * tarN + hE * tarE
        totalMO += total; horasDirectasOT += hN + hE
        manoObra.push({ id: id(), otId, faenaId, trabajadorId: t.id, nombre: t.nombre, horasNormales: hN, horasExtra: hE, tarifaNormal: tarN, tarifaExtra: tarE, total })
      }
    }
    const desc = s.descripcion ?? (preventiva ? 'Mantención preventiva programada' : elegir(descripciones))
    ots.push({
      id: otId, faenaId, equipoId: eq.id, tipoMantenimiento: preventiva ? 'PREVENTIVO' : 'CORRECTIVO', estado: ultimoEstado,
      prioridad: s.descripcion ? 'ALTA' : elegir(['BAJA', 'MEDIA', 'MEDIA', 'ALTA', 'CRITICA']), descripcionFalla: desc,
      origenFalla: preventiva ? 'MANTENIMIENTO_PREVENTIVO' : elegir(['REPORTE_OPERADOR', 'DETECCION_VISUAL', 'DETECCION_TALLER']),
      diagnostico: tDiag <= cierreSim ? 'Diagnóstico simulado' : null, trabajoEjecutado: cerrada ? 'Trabajo simulado ejecutado' : null,
      fechaCreacion: creada, fechaInicioTrabajo: tRepIni <= cierreSim ? tRepIni : null, fechaTerminoTrabajo: cerrada ? tRepFin : null,
      fechaCierre: cerrada ? tCierre : null, creadoPorId: uPor('JEFE_TALLER').id, responsableId: s.mec.usuarioId, tecnicoAsignadoId: s.mec.id,
      costoHoraSnapshot: eq.costoHoraDetencion, tiempoDetenidoMin: detMin, costoDetencion: (eq.costoHoraDetencion * detMin) / 60,
      costoManoObra: totalMO, costoOverhead: horasDirectasOT * tasaOverhead, enEsperaRepuesto: false,
    })
    if (!preventiva && !s.descripcion && rnd() < 0.5) {
      reportes.push({ id: id(), faenaId, equipoId: eq.id, reportadoPorId: uPor('MECANICO').id, descripcion: `Reporte simulado: ${desc}`, prioridadSugerida: 'MEDIA', prioridad: 'MEDIA', estado: 'CONVERTIDO_OT', otId, fecha: creada })
    }
  }
  for (let k = 0; k < 4; k++) reportes.push({ id: id(), faenaId, equipoId: elegir(equipos).id, reportadoPorId: uPor('MECANICO').id, descripcion: 'Reporte simulado pendiente de evaluación', prioridadSugerida: 'BAJA', prioridad: 'BAJA', estado: 'PENDIENTE', fecha: sumarDias(INICIO, SIM_DIAS - entero(1, 5)) })

  // Bodega: entradas + salidas en orden cronológico, con snapshots antes/después
  const bodega = procesarBodega(lotesIn, reqSalidas, id)
  const repuestos: Row[] = reqSalidas.map(r => {
    const costo = bodega.costoPorRef.get(r.ref)!
    return { id: r.ref, otId: r.otId, faenaId, descripcion: r.itemDesc, cantidad: r.cantidad, unidad: 'un', precioUnit: costo / r.cantidad, total: costo, estadoSolicitud: 'ENTREGADO', registradoById: uPor('BODEGA').id, itemBodegaId: r.itemId }
  })
  const movimientos: Row[] = bodega.movimientos.map(m => ({
    id: m.id, itemId: m.itemId, faenaId, tipo: m.tipo, cantidad: m.cantidad, stockAntes: m.stockAntes, stockDespues: m.stockDespues,
    otId: m.otId, usuarioId: uPor('BODEGA').id, observacion: m.tipo === 'ENTRADA' ? 'Simulación: entrada de lote' : 'Simulación: salida FIFO por OT', createdAt: m.fecha,
  }))
  const consumos: Row[] = bodega.consumos.map(c => ({ ...c }))
  const lotes: Row[] = lotesIn.map(l => ({ id: l.id, itemId: l.itemId, cantidad: l.cantidad, cantidadSaldo: bodega.saldo.get(l.id)!, costoUnitario: l.costo, fechaRecepcion: l.fecha, documento: 'SIM-FACT' }))
  const itemsRows = items.map(i => ({ ...i, stockActual: bodega.stock.get(i.id) ?? 0 }))

  // Horómetros: no avanzan mientras el equipo está detenido
  const lecturasPorEquipo = new Map<string, Lectura[]>()
  const horometros: Row[] = []
  for (const e of equipos) {
    const lect = generarLecturas({ horom0: e.horom0, inicio: INICIO, dias: SIM_DIAS, ventanas: ventanasPorEquipo.get(e.id) ?? [], rnd })
    lecturasPorEquipo.set(e.id, lect)
    for (const l of lect) horometros.push({ id: id(), equipoId: e.id, faenaId, horometro: l.horometro, fechaRegistro: l.fecha, usuarioId: uPor('MECANICO').id, origen: 'simulacion' })
  }

  // Estados de Pago: resultado ESPERADO por periodo (regla correcta: ventanas recortadas y unidas)
  const esperados: PeriodoEsperado[] = []
  for (let p = 0; p < 3; p++) {
    const { inicio, termino } = calcularPeriodo(new Date(2026, 5 + p, 26))
    const diasPeriodo = Math.round((termino.getTime() - inicio.getTime()) / DIA_MS)
    const lineas: LineaEsperada[] = []
    for (const e of equipos) {
      const asig = asignaciones.find(a => a.equipoId === e.id)!
      const diasVigentes = Math.min(diasPeriodo, Math.round((termino.getTime() - Math.max(asig.fechaInicio.getTime(), inicio.getTime())) / DIA_MS))
      if (diasVigentes <= 0) continue
      const minDet = minutosDetencionEnPeriodo(ventanasPorEquipo.get(e.id) ?? [], inicio, termino)
      const horasTrab = e.modalidad === 'HORA' ? deltaHorometro(lecturasPorEquipo.get(e.id)!, inicio, termino) : 0
      const r = calcularLineaArriendo({ modalidad: e.modalidad, tarifa: e.tarifa, politicaProrateo: e.politica, diasPeriodo, diasVigentes, horasTrabajadas: horasTrab, horasDetencion: minDet / 60, porcentajeDescuentoDetencion: 100 })
      // Regla actual de prepararEstadoPago(): suma completa de tiempoDetenidoMin de toda OT con creación <= termino y término técnico null o >= inicio.
      const minActual = otVentanas.filter(o => o.equipoId === e.id && o.creada.getTime() <= termino.getTime() && (o.fechaTerminoTrabajo === null || o.fechaTerminoTrabajo.getTime() >= inicio.getTime())).reduce((a, o) => a + o.tiempoDetenidoMin, 0)
      lineas.push({ codigo: e.codigo, modalidad: e.modalidad, politica: e.politica, diasVigentes, horasTrabajadas: horasTrab, minutosDetencion: minDet, horasDetencion: minDet / 60, cantidadUnidades: r.cantidadUnidades, montoBruto: r.montoBruto, descuentoDetencion: r.descuentoDetencion, montoNeto: r.montoNeto, horasDetencionLogicaActual: minActual / 60 })
    }
    esperados.push({ periodo: p + 1, inicio, termino, diasPeriodo, lineas, totalBruto: lineas.reduce((a, l) => a + l.montoBruto, 0), totalDescuentos: lineas.reduce((a, l) => a + l.descuentoDetencion, 0), totalNeto: lineas.reduce((a, l) => a + l.montoNeto, 0) })
  }

  // Solo los 2 primeros periodos se insertan como historia sintética; el 3º lo prepara la auditoría con el flujo real.
  const estadosPago: Row[] = [], lineasPago: Row[] = []
  for (const esp of esperados.slice(0, 2)) {
    const epId = id()
    for (const l of esp.lineas) {
      const e = eqPorCodigo(l.codigo), asig = asignaciones.find(a => a.equipoId === e.id)!
      lineasPago.push({ id: id(), estadoPagoId: epId, equipoId: e.id, asignacionId: asig.id, modalidad: e.modalidad, tarifa: e.tarifa, cantidadUnidades: l.cantidadUnidades, montoBruto: l.montoBruto, horasDetencion: l.horasDetencion, descuentoDetencion: l.descuentoDetencion, montoNeto: l.montoNeto })
    }
    estadosPago.push({ id: epId, faenaId, periodoInicio: esp.inicio, periodoTermino: esp.termino, estado: 'APROBADO', preparadoPorId: uPor('ADMINISTRADOR').id, aprobadoPorId: uPor('GERENCIA').id, fechaAprobacion: sumarDias(esp.termino, 2), totalBruto: esp.totalBruto, totalDescuentos: esp.totalDescuentos, totalNeto: esp.totalNeto })
  }

  const abiertas = new Set(ots.filter(o => o.estado !== 'CERRADA').map(o => o.equipoId as string))
  const acumDet = new Map<string, number>()
  for (const o of ots) acumDet.set(o.equipoId as string, (acumDet.get(o.equipoId as string) ?? 0) + (o.costoDetencion as number))
  const equiposRows = equipos.map(e => ({
    id: e.id, faenaId, codigo: e.codigo, nombre: e.nombre, tipo: e.tipo, marca: e.marca, modelo: e.modelo, costoHoraDetencion: e.costoHoraDetencion,
    horometroActual: lecturasPorEquipo.get(e.id)!.at(-1)!.horometro, estado: abiertas.has(e.id) ? 'DETENIDO' : 'OPERATIVO', costoDetencionAcumulado: acumDet.get(e.id) ?? 0,
  }))

  return {
    faenaId, usuarios, tecnicos, trabajadores, equipos: equiposRows, equiposMeta: equipos, asignaciones, items: itemsRows, lotes, ots, historial, movimientos, consumos,
    repuestos, manoObra, reportes, horometros, estadosPago, lineasPago, esperados, ventanasPorEquipo, lecturasPorEquipo, lotesIn, reqSalidas, bodega,
  }
}
