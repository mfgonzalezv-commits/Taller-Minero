import { describe, it, expect } from 'vitest'
import {
  generarEscenario, generarLecturas, deltaHorometro, minutosDetencionEnPeriodo, unirIntervalos,
  procesarBodega, planLimpieza, DIA_MS, SIM_INICIO, type Lectura,
} from '../src/lib/simulacion-sim01'
import { calcularPeriodo } from '../src/lib/periodo-pago'

const esc = generarEscenario('hash-de-prueba')
const periodos = [0, 1, 2].map(p => calcularPeriodo(new Date(2026, 5 + p, 26)))
const eq = (codigo: string) => esc.equiposMeta.find(e => e.codigo === codigo)!
const lect = (codigo: string): Lectura[] => esc.lecturasPorEquipo.get(eq(codigo).id)!
const vent = (codigo: string) => esc.ventanasPorEquipo.get(eq(codigo).id) ?? []
const ini = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h, 0, 0)

describe('Horómetro: delta por periodo', () => {
  it('cada línea HORA esperada = última - primera lectura del periodo (sin divisiones arbitrarias)', () => {
    for (const per of esc.esperados) {
      for (const l of per.lineas.filter(x => x.modalidad === 'HORA')) {
        // ventana efectiva = periodo ∩ vigencia de la asignación
        const desde = new Date(Math.max(per.inicio.getTime(), eq(l.codigo).inicioAsig.getTime()))
        const lecturas = lect(l.codigo).filter(x => x.fecha >= desde && x.fecha <= per.termino).sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
        const manual = lecturas.at(-1)!.horometro - lecturas[0].horometro
        expect(l.horasTrabajadas).toBeCloseTo(manual, 6)
        expect(l.horasTrabajadas).toBe(deltaHorometro(lect(l.codigo), desde, per.termino))
        expect(l.cantidadUnidades).toBeCloseTo(manual, 6) // la línea factura exactamente el delta
      }
    }
  })

  it('un periodo con menos de 2 lecturas produce delta 0', () => {
    expect(deltaHorometro([{ fecha: ini(2026, 7, 1), horometro: 100 }], ini(2026, 6, 26), ini(2026, 7, 25))).toBe(0)
  })
})

describe('Horómetro detenido', () => {
  it('no avanza durante días completos de detención (generarLecturas)', () => {
    const inicio = SIM_INICIO()
    const ventanas = [{ ini: new Date(inicio.getTime() + 10 * DIA_MS), fin: new Date(inicio.getTime() + 13 * DIA_MS) }] // días 10, 11 y 12 completos
    const l = generarLecturas({ horom0: 1000, inicio, dias: 20, ventanas, rnd: () => 0.5 })
    expect(l[10].horometro).toBe(l[9].horometro)
    expect(l[11].horometro).toBe(l[9].horometro)
    expect(l[12].horometro).toBe(l[9].horometro)
    expect(l[13].horometro).toBeGreaterThan(l[12].horometro)
  })

  it('en el escenario, SIM-MAQ-02 (3 días completos detenido desde el 2-ago) tiene lecturas iguales esos días', () => {
    const l = lect('SIM-MAQ-02')
    const dia = (y: number, m: number, d: number) => l.find(x => x.fecha.getFullYear() === y && x.fecha.getMonth() === m - 1 && x.fecha.getDate() === d)!.horometro
    expect(dia(2026, 8, 2)).toBe(dia(2026, 8, 1))
    expect(dia(2026, 8, 3)).toBe(dia(2026, 8, 1))
    expect(dia(2026, 8, 4)).toBe(dia(2026, 8, 1))
    expect(dia(2026, 8, 5)).toBeGreaterThan(dia(2026, 8, 4))
  })

  it('el horómetro nunca retrocede', () => {
    for (const e of esc.equiposMeta) {
      const l = lect(e.codigo)
      for (let i = 1; i < l.length; i++) expect(l[i].horometro).toBeGreaterThanOrEqual(l[i - 1].horometro)
    }
  })
})

describe('Detención que cruza periodos (día 25/26)', () => {
  it('SIM-CAM-01: 12 h desde 25-jul 20:00 se reparten 4 h en el periodo 1 y 8 h en el 2, sin perder ni duplicar', () => {
    const v = vent('SIM-CAM-01').filter(x => x.ini.getTime() === ini(2026, 7, 25, 20).getTime())
    expect(v).toHaveLength(1)
    const p1 = minutosDetencionEnPeriodo(v, periodos[0].inicio, periodos[0].termino)
    const p2 = minutosDetencionEnPeriodo(v, periodos[1].inicio, periodos[1].termino)
    expect(p1).toBeCloseTo(240, 0) // 20:00 a 23:59:59
    expect(p2).toBeCloseTo(480, 6) // 00:00 a 08:00
    expect(p1 + p2).toBeCloseTo(720, 0)
  })

  it('los límites se recortan exactamente: nada fuera del periodo cuenta', () => {
    const v = [{ ini: ini(2026, 7, 20), fin: ini(2026, 8, 5) }]
    const p1 = minutosDetencionEnPeriodo(v, periodos[0].inicio, periodos[0].termino)
    const p2 = minutosDetencionEnPeriodo(v, periodos[1].inicio, periodos[1].termino)
    expect(p1).toBeCloseTo(6 * 1440, 0) // 20-jul 00:00 a 25-jul 23:59:59 (6 días)
    expect(p2).toBeCloseTo(10 * 1440, 6) // 26-jul a 5-ago
  })

  it('SIM-CAM-02 cruza 25/26 de agosto y queda repartida entre periodos 2 y 3', () => {
    const v = vent('SIM-CAM-02').filter(x => x.ini.getTime() === ini(2026, 8, 25, 22).getTime())
    expect(minutosDetencionEnPeriodo(v, periodos[1].inicio, periodos[1].termino)).toBeCloseTo(120, 0)
    expect(minutosDetencionEnPeriodo(v, periodos[2].inicio, periodos[2].termino)).toBeCloseTo(600, 6)
  })
})

describe('Detenciones superpuestas', () => {
  it('SIM-LIV-01: dos OT simultáneas se unen en una sola ventana (22 h, no 28 h)', () => {
    const v = vent('SIM-LIV-01').filter(x => x.ini.getTime() >= ini(2026, 8, 10).getTime() && x.ini.getTime() <= ini(2026, 8, 10, 23).getTime())
    expect(v).toHaveLength(2)
    const separado = v.reduce((a, x) => a + (x.fin.getTime() - x.ini.getTime()) / 60000, 0)
    const unido = minutosDetencionEnPeriodo(v, periodos[1].inicio, periodos[1].termino)
    expect(separado).toBeCloseTo(28 * 60, 6) // 12 h + 16 h contadas por separado
    expect(unido).toBeCloseTo(22 * 60, 6) // 10-ago 08:00 a 11-ago 06:00
  })

  it('SIM-CAM-03: OT que cruza 25/26 y se superpone con otra en el periodo 3 no duplica el tramo común', () => {
    const v = vent('SIM-CAM-03').filter(x => x.ini >= ini(2026, 8, 25, 18) && x.ini <= ini(2026, 8, 26, 6))
    expect(v).toHaveLength(2)
    // (a) 25-ago 18:00 a 26-ago 12:00, (b) 26-ago 06:00 a 18:00 -> unión 26-ago 00:00 a 18:00 en el periodo 3
    expect(minutosDetencionEnPeriodo(v, periodos[2].inicio, periodos[2].termino)).toBeCloseTo(18 * 60, 6)
    expect(minutosDetencionEnPeriodo(v, periodos[1].inicio, periodos[1].termino)).toBeCloseTo(6 * 60, 0)
  })

  it('unirIntervalos une solapados y tocados, deja separados los disjuntos', () => {
    const u = unirIntervalos([
      { ini: ini(2026, 7, 1, 10), fin: ini(2026, 7, 1, 12) }, { ini: ini(2026, 7, 1, 11), fin: ini(2026, 7, 1, 15) },
      { ini: ini(2026, 7, 1, 15), fin: ini(2026, 7, 1, 16) }, { ini: ini(2026, 7, 2, 8), fin: ini(2026, 7, 2, 9) },
    ])
    expect(u).toHaveLength(2)
    expect(u[0].fin.getTime()).toBe(ini(2026, 7, 1, 16).getTime())
  })

  it('el esperado usa la unión; la lógica actual de prepararEstadoPago sobrecuenta en LIV-01 y CAM-03', () => {
    const per2 = esc.esperados[1].lineas.find(l => l.codigo === 'SIM-LIV-01')!
    expect(per2.horasDetencionLogicaActual).toBeGreaterThan(per2.horasDetencion) // suma OT completas vs. unión recortada
    const per3 = esc.esperados[2].lineas.find(l => l.codigo === 'SIM-CAM-03')!
    expect(per3.horasDetencionLogicaActual).toBeGreaterThan(per3.horasDetencion)
  })
})

describe('FIFO con entradas y salidas', () => {
  const t = (d: number) => new Date(2026, 6, d)
  const mkId = () => { let n = 0; return () => `id-${n++}` }

  it('consume del lote más antiguo primero, con snapshots cronológicos y stock final coherente', () => {
    const lotes = [
      { id: 'L1', itemId: 'A', cantidad: 10, costo: 100, fecha: t(1) },
      { id: 'L2', itemId: 'A', cantidad: 10, costo: 120, fecha: t(5) },
    ]
    const salidas = [
      { ref: 'S2', itemId: 'A', cantidad: 8, fecha: t(6), otId: 'ot2' },
      { ref: 'S1', itemId: 'A', cantidad: 6, fecha: t(3), otId: 'ot1' }, // declarada desordenada a propósito
    ]
    const r = procesarBodega(lotes, salidas, mkId())
    expect(r.costoPorRef.get('S1')).toBe(600) // 6 x 100
    expect(r.costoPorRef.get('S2')).toBe(4 * 100 + 4 * 120) // 4 del L1 + 4 del L2
    expect(r.saldo.get('L1')).toBe(0)
    expect(r.saldo.get('L2')).toBe(6)
    expect(r.stock.get('A')).toBe(20 - 6 - 8)
    const m = r.movimientos
    expect(m.map(x => x.tipo)).toEqual(['ENTRADA', 'SALIDA', 'ENTRADA', 'SALIDA']) // orden cronológico
    for (let i = 0; i < m.length; i++) {
      if (i > 0) expect(m[i].stockAntes).toBe(m[i - 1].stockDespues)
      expect(m[i].stockDespues).toBe(m[i].stockAntes + (m[i].tipo === 'ENTRADA' ? m[i].cantidad : -m[i].cantidad))
    }
  })

  it('una salida no puede usar un lote que aún no ha entrado', () => {
    const lotes = [{ id: 'L1', itemId: 'A', cantidad: 5, costo: 100, fecha: t(1) }, { id: 'L2', itemId: 'A', cantidad: 50, costo: 90, fecha: t(10) }]
    expect(() => procesarBodega(lotes, [{ ref: 'S', itemId: 'A', cantidad: 8, fecha: t(4), otId: 'x' }], mkId())).toThrow(/insuficiente/)
  })

  it('en el escenario: entradas - salidas = stock final = suma de saldos de lotes, y hay ENTRADAS para lotes iniciales y reposiciones', () => {
    for (const it of esc.items) {
      const m = esc.movimientos.filter(x => x.itemId === it.id)
      const ent = m.filter(x => x.tipo === 'ENTRADA').reduce((a, x) => a + (x.cantidad as number), 0)
      const sal = m.filter(x => x.tipo === 'SALIDA').reduce((a, x) => a + (x.cantidad as number), 0)
      const lotes = esc.lotes.filter(l => l.itemId === it.id)
      expect(m.filter(x => x.tipo === 'ENTRADA')).toHaveLength(lotes.length)
      expect(ent - sal).toBe(it.stockActual)
      expect(lotes.reduce((a, l) => a + (l.cantidadSaldo as number), 0)).toBe(it.stockActual)
    }
    const costoRep = esc.repuestos.reduce((a, r) => a + (r.total as number), 0)
    const costoCons = esc.consumos.reduce((a, c) => a + (c.cantidad as number) * (c.costoUnitario as number), 0)
    expect(costoCons).toBeCloseTo(costoRep, 4)
  })
})

describe('Estado de Pago del escenario', () => {
  it('solo se insertan 2 periodos históricos; el 3º queda como esperado para preparar con el flujo real', () => {
    expect(esc.estadosPago).toHaveLength(2)
    expect(esc.esperados).toHaveLength(3)
    const iniciosInsertados = esc.estadosPago.map(e => (e.periodoInicio as Date).getTime())
    expect(iniciosInsertados).not.toContain(esc.esperados[2].inicio.getTime())
    expect(esc.esperados[2].lineas.length).toBeGreaterThan(0)
  })
})

describe('Reproducibilidad y limpieza exclusiva de SIM-01', () => {
  it('dos generaciones con la misma semilla producen exactamente los mismos datos', () => {
    const a = generarEscenario('hash-de-prueba'), b = generarEscenario('hash-de-prueba')
    const ser = (x: typeof a) => JSON.stringify({ ...x, bodega: undefined, ventanasPorEquipo: [...x.ventanasPorEquipo], lecturasPorEquipo: [...x.lecturasPorEquipo] })
    expect(ser(a)).toBe(ser(b))
  })

  it('todos los datos generados pertenecen a la faena SIM-01', () => {
    const grupos = [esc.usuarios, esc.tecnicos, esc.trabajadores, esc.equipos, esc.asignaciones, esc.items, esc.ots, esc.historial, esc.movimientos, esc.repuestos, esc.manoObra, esc.reportes, esc.horometros, esc.estadosPago]
    for (const g of grupos) for (const r of g as { faenaId: string }[]) expect(r.faenaId).toBe(esc.faenaId)
  })

  it('el plan de limpieza está acotado a la faena en TODOS los pasos (nunca borra sin filtro)', () => {
    const plan = planLimpieza(esc.faenaId)
    expect(plan.length).toBeGreaterThan(10)
    for (const paso of plan) {
      const s = JSON.stringify(paso.where)
      expect(s).toContain(esc.faenaId)
      expect(Object.keys(paso.where).length).toBeGreaterThan(0)
    }
    expect(new Set(plan.map(p => p.modelo)).size).toBe(plan.length)
  })
})
