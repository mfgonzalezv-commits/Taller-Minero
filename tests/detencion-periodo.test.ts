import { describe, it, expect } from 'vitest'
import { minutosDetencionUnicos, unirIntervalos, ventanaEfectiva, deltaHorometroEnVentana, type OtDetencion, type LecturaHorometro } from '../src/lib/detencion-periodo'
import { calcularLineaAsignacion, type AsignacionArriendo } from '../src/lib/linea-estado-pago'
import { generarEscenario } from '../src/lib/simulacion-sim01'
import { calcularPeriodo } from '../src/lib/periodo-pago'

const d = (m: number, dia: number, h = 0, min = 0) => new Date(2026, m - 1, dia, h, min, 0)
const PERIODO = { inicio: d(7, 26), termino: new Date(2026, 7, 25, 23, 59, 59) } // 26-jul a 25-ago
const CTX = { equipoId: 'E1', faenaId: 'F1' }
const ot = (ini: Date, fin: Date | null, extra: Partial<OtDetencion> = {}): OtDetencion => ({ equipoId: 'E1', faenaId: 'F1', estado: 'CERRADA', fechaCreacion: ini, fechaTerminoTrabajo: fin, ...extra })
const V = ventanaEfectiva(PERIODO, { fechaInicio: d(6, 1), fechaTermino: null })!
const min = (ots: OtDetencion[], v = V) => minutosDetencionUnicos(ots, CTX, v)

describe('Detención por periodo: casos base', () => {
  it('OT completamente dentro del periodo cuenta sus minutos exactos', () => {
    expect(min([ot(d(8, 10, 8), d(8, 10, 20))])).toBe(720)
  })

  it('equipo sin detenciones = 0', () => {
    expect(min([])).toBe(0)
  })

  it('OT que cruza el 25/26 se reparte entre periodos sin perder ni duplicar minutos', () => {
    const o = [ot(d(7, 25, 20), d(7, 26, 8))]
    const anterior = ventanaEfectiva({ inicio: d(6, 26), termino: new Date(2026, 6, 25, 23, 59, 59) }, { fechaInicio: d(6, 1), fechaTermino: null })!
    expect(min(o, anterior)).toBeCloseTo(240, 0) // 20:00 a 23:59:59
    expect(min(o)).toBe(480) // 00:00 a 08:00 del 26
    expect(min(o, anterior) + min(o)).toBeCloseTo(720, 0)
  })

  it('dos o más OT simultáneas cuentan cada minuto una sola vez', () => {
    const o = [ot(d(8, 10, 8), d(8, 10, 20)), ot(d(8, 10, 14), d(8, 11, 6)), ot(d(8, 10, 9), d(8, 10, 10))]
    expect(min(o)).toBe(22 * 60) // 10-ago 08:00 a 11-ago 06:00 (la suma simple daría 29 h)
  })

  it('OT contiguas se unen sin huecos ni duplicados', () => {
    expect(unirIntervalos([{ ini: d(8, 1, 8), fin: d(8, 1, 12) }, { ini: d(8, 1, 12), fin: d(8, 1, 16) }])).toHaveLength(1)
  })

  it('OT abiertas terminan en el límite del periodo; dos abiertas simultáneas no se duplican', () => {
    const una = min([ot(d(8, 24, 12), null)])
    expect(una).toBeCloseTo(36 * 60, 0) // 24-ago 12:00 a 25-ago 23:59:59
    expect(min([ot(d(8, 24, 12), null), ot(d(8, 24, 16), null)])).toBeCloseTo(una, 6)
  })


  it('OT cerrada directamente (sin fechaTerminoTrabajo) termina en su fecha de cierre, no queda "abierta" hasta fin de periodo', () => {
    const cerradaDirecta = ot(d(8, 10, 8), null, { estado: 'CERRADA', fechaCierre: d(8, 10, 12) })
    expect(min([cerradaDirecta])).toBe(240)
    expect(min([ot(d(7, 1), null, { estado: 'CERRADA', fechaCierre: d(7, 5) })])).toBe(0) // cerrada antes del periodo
  })

  it('OT anuladas no cuentan', () => {
    expect(min([ot(d(8, 10, 8), d(8, 10, 20), { estado: 'ANULADA' })])).toBe(0)
  })

  it('OT del mismo equipo pero de otra faena no cuentan (ni las de otro equipo)', () => {
    expect(min([ot(d(8, 10, 8), d(8, 10, 20), { faenaId: 'F2' }), ot(d(8, 10, 8), d(8, 10, 20), { equipoId: 'E2' })])).toBe(0)
  })

  it('OT que termina antes del inicio del periodo o empieza después del término no cuenta', () => {
    expect(min([ot(d(7, 20), d(7, 25)), ot(d(8, 26, 1), d(8, 27))])).toBe(0)
  })
})

describe('Asignación iniciada o terminada a mitad del periodo', () => {
  it('asignación que inicia el 10-ago: solo cuenta la detención desde esa fecha', () => {
    const v = ventanaEfectiva(PERIODO, { fechaInicio: d(8, 10), fechaTermino: null })!
    expect(v.inicio.getTime()).toBe(d(8, 10).getTime())
    expect(min([ot(d(8, 1), d(8, 12))], v)).toBe(48 * 60) // 10-ago 00:00 a 12-ago 00:00
  })

  it('asignación que termina el 15-ago: solo cuenta hasta esa fecha', () => {
    const v = ventanaEfectiva(PERIODO, { fechaInicio: d(6, 1), fechaTermino: d(8, 15) })!
    expect(min([ot(d(8, 14), d(8, 20))], v)).toBe(24 * 60) // 14-ago 00:00 a 15-ago 00:00
    expect(min([ot(d(8, 10), null)], v)).toBe(5 * 24 * 60) // abierta: hasta el término efectivo
  })

  it('asignación fuera del periodo no tiene ventana', () => {
    expect(ventanaEfectiva(PERIODO, { fechaInicio: d(9, 1), fechaTermino: null })).toBeNull()
    expect(ventanaEfectiva(PERIODO, { fechaInicio: d(1, 1), fechaTermino: d(7, 1) })).toBeNull()
  })
})

describe('Horómetro (HORA): última - primera lectura de la ventana efectiva', () => {
  const lec = (fecha: Date, horometro: number, extra: Partial<LecturaHorometro> = {}): LecturaHorometro => ({ equipoId: 'E1', faenaId: 'F1', fecha, horometro, ...extra })

  it('delta = última - primera dentro del periodo', () => {
    expect(deltaHorometroEnVentana([lec(d(7, 27), 100), lec(d(8, 10), 180), lec(d(8, 24), 260)], CTX, V)).toBe(160)
  })

  it('lecturas de otra faena (o de otro equipo) no alteran el cobro', () => {
    const l = [lec(d(7, 27), 100), lec(d(8, 24), 260), lec(d(7, 28), 5000, { faenaId: 'F2' }), lec(d(8, 25), 9999, { faenaId: 'F2' }), lec(d(8, 1), 1, { equipoId: 'E2' })]
    expect(deltaHorometroEnVentana(l, CTX, V)).toBe(160)
  })

  it('lecturas anteriores al inicio de la asignación no alteran el cobro', () => {
    const v = ventanaEfectiva(PERIODO, { fechaInicio: d(8, 10), fechaTermino: null })!
    const l = [lec(d(8, 1), 100), lec(d(8, 10, 18), 200), lec(d(8, 20), 250)]
    expect(deltaHorometroEnVentana(l, CTX, v)).toBe(50) // no 150
  })

  it('con menos de 2 lecturas o lecturas nulas el delta es 0', () => {
    expect(deltaHorometroEnVentana([lec(d(8, 1), 100)], CTX, V)).toBe(0)
    expect(deltaHorometroEnVentana([lec(d(8, 1), 100), { ...lec(d(8, 2), 0), horometro: null }], CTX, V)).toBe(0)
  })
})

describe('Línea de Estado de Pago', () => {
  const base: Omit<AsignacionArriendo, 'modalidad' | 'tarifa'> = { id: 'A1', equipoId: 'E1', faenaId: 'F1', fechaInicio: d(6, 1), fechaTermino: null, politicaProrateo: 'DIAS_REALES', reglaDescuentoDetencion: '100%' }

  it('MES: descuenta la detención única (12 h de 31 días → 50.000 sobre 3.100.000)', () => {
    const l = calcularLineaAsignacion({ ...base, modalidad: 'MES', tarifa: 3_100_000 }, PERIODO, [ot(d(8, 10, 8), d(8, 10, 20)), ot(d(8, 10, 10), d(8, 10, 14))], [])
    expect(l.horasDetencion).toBeCloseTo(12, 6)
    expect(l.descuentoDetencion).toBeCloseTo(12 * (3_100_000 / 31 / 24), 4)
    expect(l.montoNeto).toBeCloseTo(3_100_000 - l.descuentoDetencion, 4)
  })

  it('HORA: registra las horas detenidas pero NO aplica descuento adicional', () => {
    const lecturas = [{ equipoId: 'E1', faenaId: 'F1', fecha: d(7, 27), horometro: 100 }, { equipoId: 'E1', faenaId: 'F1', fecha: d(8, 24), horometro: 300 }]
    const l = calcularLineaAsignacion({ ...base, modalidad: 'HORA', tarifa: 60_000 }, PERIODO, [ot(d(8, 10, 8), d(8, 12, 8))], lecturas)
    expect(l.horasDetencion).toBeCloseTo(48, 6)
    expect(l.descuentoDetencion).toBe(0)
    expect(l.cantidadUnidades).toBe(200)
    expect(l.montoBruto).toBe(200 * 60_000)
    expect(l.montoNeto).toBe(l.montoBruto)
  })
})

describe('Escenario SIM-01: las 12 líneas y los totales coinciden con el esperado (esperado-sim01.json)', () => {
  const esc = generarEscenario('hash-de-prueba')
  const asigs: AsignacionArriendo[] = esc.asignaciones.map(a => ({
    id: a.id, equipoId: a.equipoId, faenaId: a.faenaId, fechaInicio: a.fechaInicio, fechaTermino: null,
    modalidad: a.modalidadArriendo, tarifa: a.tarifa, politicaProrateo: a.politicaProrateo, reglaDescuentoDetencion: a.reglaDescuentoDetencion,
  }))
  const ots: OtDetencion[] = esc.ots.map(o => ({ equipoId: o.equipoId as string, faenaId: o.faenaId as string, estado: o.estado as string, fechaCreacion: o.fechaCreacion as Date, fechaTerminoTrabajo: (o.fechaTerminoTrabajo as Date | null) ?? null }))
  const lecturas: LecturaHorometro[] = esc.horometros.map(h => ({ equipoId: h.equipoId as string, faenaId: h.faenaId as string, fecha: h.fechaRegistro as Date, horometro: h.horometro as number }))
  const codigo = (equipoId: string) => esc.equiposMeta.find(e => e.id === equipoId)!.codigo

  for (const p of [0, 1, 2]) {
    it(`periodo ${p + 1}: líneas y totales`, () => {
      const per = calcularPeriodo(new Date(2026, 5 + p, 26))
      const esp = esc.esperados[p]
      const lineas = asigs.map(a => calcularLineaAsignacion(a, per, ots, lecturas)).filter(l => {
        const a = asigs.find(x => x.id === l.asignacionId)!
        return ventanaEfectiva(per, a) !== null
      })
      expect(lineas).toHaveLength(esp.lineas.length)
      expect(lineas.length).toBeGreaterThanOrEqual(11)
      for (const l of lineas) {
        const e = esp.lineas.find(x => x.codigo === codigo(l.equipoId))!
        expect(l.horasDetencion).toBeCloseTo(e.horasDetencion, 6)
        expect(l.descuentoDetencion).toBeCloseTo(e.descuentoDetencion, 4)
        expect(l.montoBruto).toBeCloseTo(e.montoBruto, 4)
        expect(l.montoNeto).toBeCloseTo(e.montoNeto, 4)
        expect(l.cantidadUnidades).toBeCloseTo(e.cantidadUnidades, 6)
        if (l.modalidad === 'HORA') expect(l.descuentoDetencion).toBe(0)
      }
      expect(lineas.reduce((a, l) => a + l.descuentoDetencion, 0)).toBeCloseTo(esp.totalDescuentos, 3)
      expect(lineas.reduce((a, l) => a + l.montoNeto, 0)).toBeCloseTo(esp.totalNeto, 3)
    })
  }

  it('periodo 3: 12 de 12 líneas, con menos descuento que la regla anterior (sin doble conteo)', () => {
    expect(esc.esperados[2].lineas).toHaveLength(12)
    // Caso determinista (no depende de la zona horaria): OT cruzando 25/26 + OT simultánea en SIM-CAM-03.
    const cam3 = esc.esperados[2].lineas.find(l => l.codigo === 'SIM-CAM-03')!
    expect(cam3.horasDetencionLogicaActual - cam3.horasDetencion).toBeGreaterThan(5) // la regla anterior sobrecontaba: la nueva no
  })
})
