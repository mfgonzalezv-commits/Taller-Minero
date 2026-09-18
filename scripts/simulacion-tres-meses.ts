// Simulación reproducible de 3 meses de operación (26-jun-2026 a 25-sep-2026)
// con datos 100% FICTICIOS, solo para erp_minera_dev.
//
// Uso:  npx tsx scripts/simulacion-tres-meses.ts          (falla si ya existe la faena SIM-01)
//       npx tsx scripts/simulacion-tres-meses.ts --reset  (borra SOLO lo de la faena SIM-01 y recarga)
//
// Reproducible: PRNG con semilla fija e IDs deterministas — misma corrida, mismos datos.
// No lee ni copia nada de producción. Aborta si DATABASE_URL apunta a erp_minera.
import 'dotenv/config'
import { createHash } from 'crypto'
import { hash } from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { impedirEjecucionEnProduccion } from '../src/lib/db-guard'
import { calcularPeriodo } from '../src/lib/periodo-pago'
import { calcularLineaArriendo } from '../src/lib/calculo-estado-pago'

impedirEjecucionEnProduccion('simulacion-tres-meses (datos ficticios de 3 meses)')

const SEED = 20260918
const FAENA_CODIGO = 'SIM-01'
const INICIO = new Date(2026, 5, 26, 0, 0, 0)
const DIAS = 92 // 26-jun .. 25-sep
const DIA_MS = 86_400_000

// ── PRNG e IDs deterministas ────────────────────────────────────────────────
let estado = SEED
function rnd(): number {
  estado |= 0; estado = (estado + 0x6d2b79f5) | 0
  let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const entre = (a: number, b: number) => a + rnd() * (b - a)
const entero = (a: number, b: number) => Math.floor(entre(a, b + 1))
const elegir = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
let contador = 0
function id(): string {
  const h = createHash('md5').update(`${SEED}:${contador++}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS)
const sumarHoras = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)

async function main() {
  const existente = await prisma.faena.findUnique({ where: { codigo: FAENA_CODIGO } })
  if (existente) {
    if (!process.argv.includes('--reset')) {
      console.error(`La faena ${FAENA_CODIGO} ya existe. Usa --reset para borrar SOLO sus datos y recargar.`)
      process.exit(1)
    }
    await limpiar(existente.id)
  }

  const passwordHash = await hash('password123', 10)
  const faenaId = id()

  // ── Personas ──────────────────────────────────────────────────────────────
  const roles = [
    ['admin', 'ADMINISTRADOR'], ['jefe', 'JEFE_TALLER'], ['planificador', 'PLANIFICADOR'],
    ['gerencia', 'GERENCIA'], ['bodega', 'BODEGA'], ['compras', 'COMPRAS'],
    ['mecanico1', 'MECANICO'], ['mecanico2', 'MECANICO'], ['mecanico3', 'MECANICO'],
  ] as const
  const usuarios = roles.map(([u, rol]) => ({
    id: id(), faenaId, nombre: `Sim ${u}`, email: `${u}@sim.local`, password: passwordHash, rol,
  }))
  const uPor = (rol: string) => usuarios.find(u => u.rol === rol)!
  const mecanicos = usuarios.filter(u => u.rol === 'MECANICO')
  const tecnicos = mecanicos.map(m => ({
    id: id(), usuarioId: m.id, faenaId, especialidades: ['Motor', 'Hidráulica'], turno: 'Día',
    tarifaHora: 9000, tarifaHoraExtra: 13500,
  }))

  const trabajadores = [
    ...Array.from({ length: 6 }, (_, i) => ({
      id: id(), faenaId, nombre: `Trabajador directo ${i + 1}`, tipo: 'DIRECTO' as const,
      cargo: 'Mecánico general', sueldoBruto: 900_000 + i * 50_000, horasMensuales: 180, tasaLeyesSociales: 0.28,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: id(), faenaId, nombre: `Trabajador indirecto ${i + 1}`, tipo: 'INDIRECTO' as const,
      cargo: 'Supervisor', sueldoBruto: 1_400_000, horasMensuales: 180, tasaLeyesSociales: 0.28,
    })),
  ]
  const costoHoraTrab = (t: typeof trabajadores[number]) => (t.sueldoBruto * (1 + t.tasaLeyesSociales)) / t.horasMensuales
  const directos = trabajadores.filter(t => t.tipo === 'DIRECTO')
  const costoIndirecto = trabajadores.filter(t => t.tipo === 'INDIRECTO').reduce((a, t) => a + t.sueldoBruto * (1 + t.tasaLeyesSociales), 0)
  const tasaOverhead = costoIndirecto / directos.reduce((a, t) => a + t.horasMensuales, 0)

  // ── Equipos y asignaciones (arriendo) ─────────────────────────────────────
  const defsEquipo: { pref: string; nombre: string; tipo: 'CAMION' | 'MAQUINARIA' | 'LIVIANO'; n: number; costoHora: number; modalidad: 'HORA' | 'DIA' | 'MES'; tarifa: number }[] = [
    { pref: 'SIM-CAM', nombre: 'Camión tolva', tipo: 'CAMION', n: 5, costoHora: 60_000, modalidad: 'MES', tarifa: 9_000_000 },
    { pref: 'SIM-MAQ', nombre: 'Excavadora', tipo: 'MAQUINARIA', n: 4, costoHora: 90_000, modalidad: 'HORA', tarifa: 65_000 },
    { pref: 'SIM-LIV', nombre: 'Camioneta', tipo: 'LIVIANO', n: 3, costoHora: 15_000, modalidad: 'DIA', tarifa: 80_000 },
  ]
  const equipos = defsEquipo.flatMap(d => Array.from({ length: d.n }, (_, i) => ({
    id: id(), faenaId, codigo: `${d.pref}-${String(i + 1).padStart(2, '0')}`, nombre: `${d.nombre} ${i + 1}`, tipo: d.tipo,
    marca: 'Sim', modelo: `M${i + 1}`, costoHoraDetencion: d.costoHora,
    modalidad: d.modalidad, tarifa: d.tarifa, horom0: entero(1000, 6000),
    // algunos entran a mitad del primer periodo, para ejercitar el prorrateo parcial
    inicioAsig: i === d.n - 1 ? sumarDias(INICIO, entero(5, 15)) : INICIO,
    politica: (i % 2 === 0 ? 'DIAS_REALES' : 'BASE_30') as 'DIAS_REALES' | 'BASE_30',
  })))
  const asignaciones = equipos.map(e => ({
    id: id(), equipoId: e.id, faenaId, fechaInicio: e.inicioAsig, motivo: 'Simulación: contrato de arriendo',
    usuarioResponsableId: uPor('ADMINISTRADOR').id, contrato: `SIM-${e.codigo}`, modalidadArriendo: e.modalidad,
    tarifa: e.tarifa, reglaDescuentoDetencion: '100%', politicaProrateo: e.politica,
  }))

  // ── Bodega: ítems, lotes iniciales y reposiciones (FIFO en memoria) ───────
  const items = Array.from({ length: 15 }, (_, i) => ({
    id: id(), faenaId, codigo: `SIM-ITM-${String(i + 1).padStart(3, '0')}`, descripcion: `Repuesto simulado ${i + 1}`,
    unidad: 'un', stockMinimo: 5, precioRef: 20_000 + i * 15_000, categoria: i % 3 === 0 ? 'Filtros' : 'Repuestos',
  }))
  type Lote = { id: string; itemId: string; cantidad: number; saldo: number; costo: number; fecha: Date }
  const lotes: Lote[] = []
  for (const it of items) {
    lotes.push({ id: id(), itemId: it.id, cantidad: 40, saldo: 40, costo: it.precioRef, fecha: sumarDias(INICIO, -1) })
    for (let d = 20; d < DIAS; d += 21) {
      lotes.push({ id: id(), itemId: it.id, cantidad: 30, saldo: 30, costo: Math.round(it.precioRef * entre(1.02, 1.12)), fecha: sumarDias(INICIO, d) })
    }
  }
  const movimientos: Record<string, unknown>[] = []
  const consumos: Record<string, unknown>[] = []
  const stockMem = new Map(items.map(i => [i.id, lotes.filter(l => l.itemId === i.id && l.fecha <= INICIO).reduce((a, l) => a + l.saldo, 0)]))
  // Las entradas de reposición futuras se aplican al stock cuando su fecha llega (ver consumir()).
  const consumir = (itemId: string, cant: number, fecha: Date, otId: string): number => {
    let restante = cant, costoTotal = 0
    const disp = lotes.filter(l => l.itemId === itemId && l.fecha <= fecha && l.saldo > 0).sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    const antes = disp.reduce((a, l) => a + l.saldo, 0)
    const movId = id()
    for (const l of disp) {
      if (restante <= 0) break
      const t = Math.min(l.saldo, restante)
      l.saldo -= t; restante -= t; costoTotal += t * l.costo
      consumos.push({ id: id(), loteId: l.id, movimientoId: movId, cantidad: t, costoUnitario: l.costo })
    }
    if (restante > 0) throw new Error(`Simulación: stock insuficiente en ${itemId}`)
    movimientos.push({ id: movId, itemId, faenaId, tipo: 'SALIDA', cantidad: cant, stockAntes: antes, stockDespues: antes - cant, otId, usuarioId: uPor('BODEGA').id, observacion: 'Simulación: salida FIFO por OT', createdAt: fecha })
    stockMem.set(itemId, antes - cant)
    return costoTotal
  }

  // ── Órdenes de trabajo (≈ 60) con historial coherente con TRANSICIONES_OT ─
  const ots: Record<string, unknown>[] = []
  const historial: Record<string, unknown>[] = []
  const repuestos: Record<string, unknown>[] = []
  const manoObra: Record<string, unknown>[] = []
  const reportes: Record<string, unknown>[] = []
  const ventanasDetencion: { equipoId: string; ini: Date; fin: Date; min: number }[] = []
  const fin = sumarDias(INICIO, DIAS)
  const cierreSim = fin
  const descripciones = ['Fuga de aceite hidráulico', 'Ruido anormal en motor', 'Falla eléctrica en tablero', 'Cambio de neumático', 'Recalentamiento', 'Pérdida de potencia', 'Falla de frenos', 'Mantención preventiva']
  const NOTS = 60
  for (let n = 0; n < NOTS; n++) {
    const eq = elegir(equipos)
    // las últimas 6 OT nacen al final del periodo: quedan abiertas (equipo detenido)
    const creada = n >= NOTS - 6 ? sumarHoras(sumarDias(INICIO, DIAS - 1), -entero(2, 30)) : sumarHoras(sumarDias(INICIO, entero(0, DIAS - 6)), entero(6, 16))
    const otId = id()
    const preventiva = rnd() < 0.25
    const durDiag = entre(1, 6), durRep = entre(3, 30), durVal = entre(0.5, 3)
    const espera = rnd() < 0.3 ? entre(8, 60) : 0
    const tDiag = sumarHoras(creada, durDiag)
    const tRepIni = sumarHoras(tDiag, entre(0.5, 4))
    const tEspera = espera ? sumarHoras(tRepIni, durRep * 0.4) : null
    const tRepFin = sumarHoras(tEspera ? sumarHoras(tEspera, espera) : tRepIni, durRep * (espera ? 0.6 : 1))
    const tVal = sumarHoras(tRepFin, durVal)
    const tCierre = sumarHoras(tVal, entre(1, 20))
    let estadoFinal: 'CERRADA' | 'EN_REPARACION' | 'EN_DIAGNOSTICO' | 'ESPERA_REPUESTO' = 'CERRADA'
    if (tCierre > cierreSim) estadoFinal = tRepFin > cierreSim ? (tRepIni > cierreSim ? 'EN_DIAGNOSTICO' : 'EN_REPARACION') : 'EN_REPARACION'
    const mec = elegir(tecnicos)
    const cerrada = estadoFinal === 'CERRADA'

    // Historial
    const pasos: [string | null, string, Date][] = [[null, 'ABIERTA', creada], ['ABIERTA', 'EN_DIAGNOSTICO', sumarHoras(creada, 0.3)]]
    if (tDiag <= cierreSim) pasos.push(['EN_DIAGNOSTICO', 'DIAGNOSTICADO', tDiag])
    if (tRepIni <= cierreSim) pasos.push(['DIAGNOSTICADO', 'EN_REPARACION', tRepIni])
    if (tEspera && tEspera <= cierreSim) { pasos.push(['EN_REPARACION', 'ESPERA_REPUESTO', tEspera]); const b = sumarHoras(tEspera, espera); if (b <= cierreSim) { pasos.push(['ESPERA_REPUESTO', 'LISTO_PARA_REPARAR', b]); pasos.push(['LISTO_PARA_REPARAR', 'EN_REPARACION', sumarHoras(b, 0.5)]) } }
    if (cerrada) { pasos.push(['EN_REPARACION', 'EN_VALIDACION', tRepFin]); pasos.push(['EN_VALIDACION', 'CERRADA', tCierre]) }
    let prevT = creada
    for (const [ant, nuevo, t] of pasos) {
      historial.push({ id: id(), otId, faenaId, estadoAnterior: ant, estadoNuevo: nuevo, fechaCambio: t, usuarioId: uPor('JEFE_TALLER').id, observacion: 'Simulación', tiempoEnEstadoMin: Math.round((t.getTime() - prevT.getTime()) / 60000) })
      prevT = t
    }
    const ultimoEstado = cerrada ? 'CERRADA' : (pasos[pasos.length - 1][1] as string)

    // Detención (semántica Fase 4: hasta el término técnico del trabajo)
    const finTecnico = cerrada ? tRepFin : cierreSim
    const detMin = Math.max(0, Math.round((finTecnico.getTime() - creada.getTime()) / 60000))
    const costoDet = (eq.costoHoraDetencion * detMin) / 60
    ventanasDetencion.push({ equipoId: eq.id, ini: creada, fin: finTecnico, min: detMin })

    // Repuestos (FIFO) solo en OT cerradas, con 0-3 ítems
    if (cerrada) {
      for (let k = 0; k < entero(0, 3); k++) {
        const it = elegir(items); const cant = entero(1, 4)
        const costo = consumir(it.id, cant, tDiag, otId)
        repuestos.push({ id: id(), otId, faenaId, descripcion: it.descripcion, cantidad: cant, unidad: 'un', precioUnit: costo / cant, total: costo, estadoSolicitud: 'ENTREGADO', registradoById: uPor('BODEGA').id, itemBodegaId: it.id })
      }
    }
    // Mano de obra
    let totalMO = 0, horasDirectasOT = 0
    if (cerrada || estadoFinal === 'EN_REPARACION') {
      for (let k = 0; k < entero(1, 2); k++) {
        const t = elegir(directos); const hN = Number(entre(2, 10).toFixed(1)), hE = rnd() < 0.3 ? Number(entre(1, 3).toFixed(1)) : 0
        const tarN = Math.round(costoHoraTrab(t)), tarE = Math.round(tarN * 1.5)
        const total = hN * tarN + hE * tarE
        totalMO += total; horasDirectasOT += hN + hE
        manoObra.push({ id: id(), otId, faenaId, trabajadorId: t.id, nombre: t.nombre, horasNormales: hN, horasExtra: hE, tarifaNormal: tarN, tarifaExtra: tarE, total })
      }
    }
    ots.push({
      id: otId, faenaId, equipoId: eq.id, tipoMantenimiento: preventiva ? 'PREVENTIVO' : 'CORRECTIVO', estado: ultimoEstado,
      prioridad: elegir(['BAJA', 'MEDIA', 'MEDIA', 'ALTA', 'CRITICA']), descripcionFalla: preventiva ? 'Mantención preventiva programada' : elegir(descripciones),
      origenFalla: preventiva ? 'MANTENIMIENTO_PREVENTIVO' : elegir(['REPORTE_OPERADOR', 'DETECCION_VISUAL', 'DETECCION_TALLER']),
      diagnostico: tDiag <= cierreSim ? 'Diagnóstico simulado' : null, trabajoEjecutado: cerrada ? 'Trabajo simulado ejecutado' : null,
      fechaCreacion: creada, fechaInicioTrabajo: tRepIni <= cierreSim ? tRepIni : null, fechaTerminoTrabajo: cerrada ? tRepFin : null,
      fechaCierre: cerrada ? tCierre : null, creadoPorId: uPor('JEFE_TALLER').id, responsableId: mec.usuarioId, tecnicoAsignadoId: mec.id,
      costoHoraSnapshot: eq.costoHoraDetencion, tiempoDetenidoMin: detMin, costoDetencion: costoDet, costoManoObra: totalMO,
      costoOverhead: horasDirectasOT * tasaOverhead, enEsperaRepuesto: false,
    })
    if (!preventiva && rnd() < 0.5) {
      reportes.push({ id: id(), faenaId, equipoId: eq.id, reportadoPorId: uPor('MECANICO').id, descripcion: `Reporte simulado: ${ots.at(-1)!.descripcionFalla}`, prioridadSugerida: 'MEDIA', prioridad: 'MEDIA', estado: 'CONVERTIDO_OT', otId, fecha: creada })
    }
  }
  // Reportes aún pendientes
  for (let k = 0; k < 4; k++) reportes.push({ id: id(), faenaId, equipoId: elegir(equipos).id, reportadoPorId: uPor('MECANICO').id, descripcion: 'Reporte simulado pendiente de evaluación', prioridadSugerida: 'BAJA', prioridad: 'BAJA', estado: 'PENDIENTE', fecha: sumarDias(INICIO, DIAS - entero(1, 5)) })

  // ── Horómetros: lectura diaria monótona (jornada de 0-14 h) ───────────────
  const horometros: Record<string, unknown>[] = []
  const horomFinal = new Map<string, number>()
  for (const e of equipos) {
    let h = e.horom0
    for (let d = 0; d <= DIAS; d++) {
      h += entre(0, 14)
      horometros.push({ id: id(), equipoId: e.id, faenaId, horometro: Number(h.toFixed(1)), fechaRegistro: sumarHoras(sumarDias(INICIO, d), 18), usuarioId: uPor('MECANICO').id, origen: 'simulacion' })
    }
    horomFinal.set(e.id, Number(h.toFixed(1)))
  }

  // ── Estados de Pago: 3 periodos, con la fórmula real de calcularLineaArriendo ──
  const estadosPago: Record<string, unknown>[] = []
  const lineasPago: Record<string, unknown>[] = []
  for (let p = 0; p < 3; p++) {
    const base = new Date(2026, 5 + p, 26)
    const { inicio, termino } = calcularPeriodo(base)
    const diasPeriodo = Math.round((termino.getTime() - inicio.getTime()) / DIA_MS)
    const epId = id(); let bruto = 0, desc = 0, neto = 0
    for (const e of equipos) {
      const asig = asignaciones.find(a => a.equipoId === e.id)!
      const desde = Math.max(asig.fechaInicio.getTime(), inicio.getTime())
      const diasVigentes = Math.min(diasPeriodo, Math.max(0, Math.round((termino.getTime() - desde) / DIA_MS)))
      if (diasVigentes <= 0) continue
      let minDet = 0
      for (const v of ventanasDetencion.filter(v => v.equipoId === e.id)) {
        const a = Math.max(v.ini.getTime(), inicio.getTime()), b = Math.min(v.fin.getTime(), termino.getTime())
        if (b > a) minDet += (b - a) / 60000
      }
      const horasTrab = e.modalidad === 'HORA' ? Math.max(0, (horometros.filter(h => h.equipoId === e.id && (h.fechaRegistro as Date) >= inicio && (h.fechaRegistro as Date) <= termino).map(h => h.horometro as number).reduce((m, x) => Math.max(m, x), 0)) - e.horom0) / 4 : 0
      const r = calcularLineaArriendo({ modalidad: e.modalidad, tarifa: e.tarifa, politicaProrateo: e.politica, diasPeriodo, diasVigentes, horasTrabajadas: horasTrab, horasDetencion: minDet / 60, porcentajeDescuentoDetencion: 100 })
      bruto += r.montoBruto; desc += r.descuentoDetencion; neto += r.montoNeto
      lineasPago.push({ id: id(), estadoPagoId: epId, equipoId: e.id, asignacionId: asig.id, modalidad: e.modalidad, tarifa: e.tarifa, cantidadUnidades: r.cantidadUnidades, montoBruto: r.montoBruto, horasDetencion: minDet / 60, descuentoDetencion: r.descuentoDetencion, montoNeto: r.montoNeto })
    }
    const aprobado = p < 2
    estadosPago.push({ id: epId, faenaId, periodoInicio: inicio, periodoTermino: termino, estado: aprobado ? 'APROBADO' : 'PREPARADO', preparadoPorId: uPor('ADMINISTRADOR').id, aprobadoPorId: aprobado ? uPor('GERENCIA').id : null, fechaAprobacion: aprobado ? sumarDias(termino, 2) : null, totalBruto: bruto, totalDescuentos: desc, totalNeto: neto })
  }

  // ── Estado final de equipos según OT abiertas ──────────────────────────
  const abiertas = new Set(ots.filter(o => o.estado !== 'CERRADA').map(o => o.equipoId as string))
  const acumDet = new Map<string, number>()
  for (const o of ots) acumDet.set(o.equipoId as string, (acumDet.get(o.equipoId as string) ?? 0) + (o.costoDetencion as number))

  // ── Inserción en orden de dependencias ────────────────────────────────────
  await prisma.faena.create({ data: { id: faenaId, codigo: FAENA_CODIGO, nombre: 'Faena Simulada 3 meses', empresa: 'Empresa Ficticia S.A.', ubicacion: 'Simulación (solo desarrollo)' } })
  await prisma.usuario.createMany({ data: usuarios })
  await prisma.tecnico.createMany({ data: tecnicos })
  await prisma.trabajador.createMany({ data: trabajadores })
  await prisma.equipo.createMany({ data: equipos.map(e => ({ id: e.id, faenaId, codigo: e.codigo, nombre: e.nombre, tipo: e.tipo, marca: e.marca, modelo: e.modelo, costoHoraDetencion: e.costoHoraDetencion, horometroActual: horomFinal.get(e.id)!, estado: abiertas.has(e.id) ? 'DETENIDO' : 'OPERATIVO', costoDetencionAcumulado: acumDet.get(e.id) ?? 0 })) })
  await prisma.asignacionEquipoFaena.createMany({ data: asignaciones as never })
  await prisma.itemBodega.createMany({ data: items.map(i => ({ ...i, stockActual: lotes.filter(l => l.itemId === i.id).reduce((a, l) => a + l.saldo, 0) })) })
  await prisma.loteBodega.createMany({ data: lotes.map(l => ({ id: l.id, itemId: l.itemId, cantidad: l.cantidad, cantidadSaldo: l.saldo, costoUnitario: l.costo, fechaRecepcion: l.fecha, documento: 'SIM-FACT' })) })
  await prisma.ordenTrabajo.createMany({ data: ots as never })
  await prisma.historialEstadoOT.createMany({ data: historial as never })
  await prisma.movimientoBodega.createMany({ data: movimientos as never })
  await prisma.consumoLoteBodega.createMany({ data: consumos as never })
  await prisma.repuestoOT.createMany({ data: repuestos as never })
  await prisma.manoObraOT.createMany({ data: manoObra as never })
  await prisma.reporteFalla.createMany({ data: reportes as never })
  await prisma.horometroKm.createMany({ data: horometros as never })
  await prisma.estadoPago.createMany({ data: estadosPago as never })
  await prisma.estadoPagoLinea.createMany({ data: lineasPago as never })

  await verificar(faenaId)
  console.log(`Simulación lista en faena ${FAENA_CODIGO}: ${equipos.length} equipos, ${ots.length} OT, ${repuestos.length} repuestos FIFO, ${horometros.length} lecturas, 3 Estados de Pago.`)
  console.log('Login: admin@sim.local / jefe@sim.local / mecanico1@sim.local ... contraseña password123')
}

// Invariantes que deben cumplirse tras la carga (falla la corrida si no).
async function verificar(faenaId: string) {
  const items = await prisma.itemBodega.findMany({ where: { faenaId }, select: { id: true, stockActual: true } })
  for (const it of items) {
    const s = await prisma.loteBodega.aggregate({ where: { itemId: it.id }, _sum: { cantidadSaldo: true } })
    if (Math.abs(Number(s._sum.cantidadSaldo ?? 0) - Number(it.stockActual)) > 0.001) throw new Error(`FIFO inconsistente en ${it.id}`)
  }
  const neg = await prisma.loteBodega.count({ where: { item: { faenaId }, cantidadSaldo: { lt: 0 } } })
  if (neg > 0) throw new Error('Lotes con saldo negativo')
  const rep = await prisma.repuestoOT.aggregate({ where: { faenaId }, _sum: { total: true } })
  const cons = await prisma.consumoLoteBodega.findMany({ where: { lote: { item: { faenaId } } }, select: { cantidad: true, costoUnitario: true } })
  const totalCons = cons.reduce((a, c) => a + Number(c.cantidad) * Number(c.costoUnitario), 0)
  if (Math.abs(totalCons - Number(rep._sum.total ?? 0)) > 1) throw new Error('Costo de repuestos no coincide con consumos FIFO')
}

async function limpiar(faenaId: string) {
  const w = { faenaId }
  await prisma.estadoPagoLinea.deleteMany({ where: { estadoPago: w } })
  await prisma.estadoPago.deleteMany({ where: w })
  await prisma.consumoLoteBodega.deleteMany({ where: { lote: { item: w } } })
  await prisma.movimientoBodega.deleteMany({ where: w })
  await prisma.repuestoOT.deleteMany({ where: w })
  await prisma.manoObraOT.deleteMany({ where: w })
  await prisma.reporteFalla.deleteMany({ where: w })
  await prisma.historialEstadoOT.deleteMany({ where: w })
  await prisma.ordenTrabajo.deleteMany({ where: w })
  await prisma.horometroKm.deleteMany({ where: w })
  await prisma.loteBodega.deleteMany({ where: { item: w } })
  await prisma.itemBodega.deleteMany({ where: w })
  await prisma.asignacionEquipoFaena.deleteMany({ where: w })
  await prisma.equipo.deleteMany({ where: w })
  await prisma.tecnico.deleteMany({ where: w })
  await prisma.trabajador.deleteMany({ where: w })
  await prisma.usuario.deleteMany({ where: w })
  await prisma.faena.delete({ where: { id: faenaId } })
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
