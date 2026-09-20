import { describe, expect, it } from 'vitest'
import { episodiosDetencionOT, minutosDetencionUnicos, type OtDetencion } from '../src/lib/detencion-periodo'
import { calcularLineaAsignacion } from '../src/lib/linea-estado-pago'

const d = (dia: number, h: number, m = 0, mes = 9) => new Date(Date.UTC(2026, mes - 1, dia, h, m))
const CTX = { equipoId: 'E1', faenaId: 'F1' }
const H = (ant: string | null, nuevo: string, f: Date) => ({ estadoAnterior: ant, estadoNuevo: nuevo, fechaCambio: f })
const ventana = { inicio: d(1, 0), termino: d(30, 0) }
type Op = { equipoDetenidoActual: boolean; esUltimaOtDelEquipo: boolean }
const ot = (o: { estado: string; creada: Date; historial: ReturnType<typeof H>[]; termino?: Date | null; cierre?: Date | null }, libs: Date[], opts: Op = { equipoDetenidoActual: false, esUltimaOtDelEquipo: true }): OtDetencion => {
  const base = { estado: o.estado, fechaCreacion: o.creada, fechaTerminoTrabajo: o.termino ?? null, fechaCierre: o.cierre ?? null, historial: o.historial }
  return { equipoId: 'E1', faenaId: 'F1', estado: o.estado, fechaCreacion: o.creada, fechaTerminoTrabajo: o.termino ?? null, fechaCierre: o.cierre ?? null, episodios: episodiosDetencionOT(base, libs, opts) }
}
const horas = (ots: OtDetencion[], v = ventana) => minutosDetencionUnicos(ots, CTX, v) / 60

describe('detención hasta la liberación operacional', () => {
  it('término técnico → espera de validación → liberación: cuenta hasta la liberación', () => {
    const o = ot({ estado: 'CERRADA', creada: d(10, 8), termino: d(10, 12), cierre: d(10, 13), historial: [H('EN_REPARACION', 'EN_VALIDACION', d(10, 12)), H('EN_VALIDACION', 'CERRADA', d(10, 13))] }, [d(10, 20)])
    expect(horas([o])).toBe(12) // 08:00 → 20:00, no hasta las 12:00
  })
  it('retrabajo antes de liberar: toda la ventana detenida cuenta', () => {
    const o = ot({ estado: 'EN_VALIDACION', creada: d(10, 8), termino: d(10, 16), historial: [H('EN_REPARACION', 'EN_VALIDACION', d(10, 12)), H('EN_VALIDACION', 'EN_REPARACION', d(10, 14)), H('EN_REPARACION', 'EN_VALIDACION', d(10, 16))] }, [d(10, 18)])
    expect(horas([o])).toBe(10)
  })
  it('reapertura DESPUÉS de una liberación: dos episodios, sin contar el tiempo operando entre medio', () => {
    const historial = [H('EN_REPARACION', 'EN_VALIDACION', d(10, 12)), H('EN_VALIDACION', 'CERRADA', d(10, 13)), H('CERRADA', 'ABIERTA', d(12, 9)), H('EN_REPARACION', 'EN_VALIDACION', d(12, 15)), H('EN_VALIDACION', 'CERRADA', d(12, 16))]
    const o = ot({ estado: 'CERRADA', creada: d(10, 8), termino: d(12, 15), cierre: d(12, 16), historial }, [d(10, 14), d(12, 18)])
    expect(o.episodios).toHaveLength(2)
    expect(horas([o])).toBe(6 + 9) // 08→14 del día 10 y 09→18 del día 12
  })
  it('dos OT simultáneas: las ventanas se unen (no se descuenta dos veces)', () => {
    const a = ot({ estado: 'CERRADA', creada: d(10, 8), termino: d(10, 12), cierre: d(10, 13), historial: [H('X', 'EN_VALIDACION', d(10, 12)), H('EN_VALIDACION', 'CERRADA', d(10, 13))] }, [d(10, 20)])
    const b = ot({ estado: 'CERRADA', creada: d(10, 10), termino: d(10, 14), cierre: d(10, 15), historial: [H('X', 'EN_VALIDACION', d(10, 14)), H('EN_VALIDACION', 'CERRADA', d(10, 15))] }, [d(10, 22)])
    expect(horas([a, b])).toBe(14) // 08:00 → 22:00
  })
  it('OT sin liberación registrada y equipo operando (datos anteriores): termina en el término técnico', () => {
    const o = ot({ estado: 'CERRADA', creada: d(10, 8), termino: d(10, 12), cierre: d(10, 13), historial: [H('X', 'EN_VALIDACION', d(10, 12)), H('EN_VALIDACION', 'CERRADA', d(10, 13))] }, [])
    expect(horas([o])).toBe(4)
  })
  it('equipo aún detenido y esta es la última OT: el episodio sigue abierto hasta el límite del periodo', () => {
    const o = ot({ estado: 'EN_VALIDACION', creada: d(20, 8), termino: d(20, 12), historial: [H('X', 'EN_VALIDACION', d(20, 12))] }, [], { equipoDetenidoActual: true, esUltimaOtDelEquipo: true })
    expect(horas([o])).toBe((d(30, 0).getTime() - d(20, 8).getTime()) / 3_600_000)
  })
  it('una OT antigua ya cerrada NO se extiende porque otra OT posterior mantiene detenido el equipo', () => {
    const vieja = ot({ estado: 'CERRADA', creada: d(2, 8), termino: d(2, 12), cierre: d(2, 13), historial: [H('X', 'EN_VALIDACION', d(2, 12)), H('EN_VALIDACION', 'CERRADA', d(2, 13))] }, [], { equipoDetenidoActual: true, esUltimaOtDelEquipo: false })
    expect(horas([vieja])).toBe(4)
  })
  it('cambio de periodo 26–25: el episodio se reparte sin perder ni duplicar minutos', () => {
    const o = ot({ estado: 'CERRADA', creada: d(25, 20), termino: d(25, 22), cierre: d(26, 5), historial: [H('X', 'EN_VALIDACION', d(25, 22)), H('EN_VALIDACION', 'CERRADA', d(26, 5))] }, [d(26, 4)])
    const p1 = { inicio: d(26, 0, 0, 8), termino: d(26, 0) }, p2 = { inicio: d(26, 0), termino: d(25, 23, 59, 10) }
    const a = horas([o], p1), b = horas([o], p2)
    expect(a).toBeCloseTo(4, 1) // 20:00 → 00:00 (fin del periodo anterior)
    expect(b).toBeCloseTo(4, 1) // 00:00 → 04:00 del 26
    expect(a + b).toBeCloseTo(8, 1)
  })
})

describe('una liberación pertenece a la OT de su ciclo', () => {
  it('OT antigua sin liberación registrada NO toma la liberación de una OT posterior', () => {
    const vieja = { estado: 'CERRADA', fechaCreacion: d(3, 8), fechaTerminoTrabajo: d(3, 12), fechaCierre: d(3, 13), historial: [H('X', 'EN_VALIDACION', d(3, 12)), H('EN_VALIDACION', 'CERRADA', d(3, 13))] }
    const eps = episodiosDetencionOT(vieja, [d(20, 10)], { equipoDetenidoActual: false, esUltimaOtDelEquipo: false, iniciosOtrasOt: [d(10, 8)] })
    expect(eps).toEqual([{ ini: d(3, 8), fin: d(3, 12) }])
  })
  it('una OT simultánea (creada ANTES del término técnico) sí comparte la liberación', () => {
    const a = { estado: 'CERRADA', fechaCreacion: d(3, 8), fechaTerminoTrabajo: d(3, 12), fechaCierre: d(3, 13), historial: [H('X', 'EN_VALIDACION', d(3, 12)), H('EN_VALIDACION', 'CERRADA', d(3, 13))] }
    expect(episodiosDetencionOT(a, [d(3, 20)], { equipoDetenidoActual: false, esUltimaOtDelEquipo: false, iniciosOtrasOt: [d(3, 10)] })).toEqual([{ ini: d(3, 8), fin: d(3, 20) }])
  })
})

describe('modalidad HORA: la detención es información, sin descuento adicional', () => {
  it('registra las horas detenidas pero no descuenta', () => {
    const o = ot({ estado: 'CERRADA', creada: d(10, 8), termino: d(10, 12), cierre: d(10, 13), historial: [H('X', 'EN_VALIDACION', d(10, 12)), H('EN_VALIDACION', 'CERRADA', d(10, 13))] }, [d(10, 20)])
    const asign = { id: 'A1', equipoId: 'E1', faenaId: 'F1', fechaInicio: d(1, 0), fechaTermino: null, modalidad: 'HORA' as const, tarifa: 50_000, politicaProrateo: 'DIAS_REALES' as const, reglaDescuentoDetencion: '100%' }
    const lecturas = [{ equipoId: 'E1', faenaId: 'F1', fecha: d(2, 0), horometro: 1000 }, { equipoId: 'E1', faenaId: 'F1', fecha: d(29, 0), horometro: 1100 }]
    const l = calcularLineaAsignacion(asign, ventana, [o], lecturas)
    expect(l.horasDetencion).toBe(12)
    expect(l.descuentoDetencion).toBe(0)
    expect(l.montoBruto).toBe(100 * 50_000)
    expect(l.montoNeto).toBe(l.montoBruto)
  })
})

describe('detención SIN OT (episodios registrados al detener el equipo)', () => {
  const episodio = (ini: Date, fin: Date | null): OtDetencion => ({ equipoId: 'E1', faenaId: 'F1', estado: 'DETENCION', fechaCreacion: ini, fechaTerminoTrabajo: null, episodios: [{ ini, fin }] })
  it('equipo detenido sin OT: cuenta desde la detención hasta la liberación', () => {
    expect(horas([episodio(d(10, 8), d(10, 20))])).toBe(12)
  })
  it('reporte detenido → demora → creación de OT: la hora inicial es la del reporte, no la de la OT', () => {
    const detencion = episodio(d(10, 8), d(10, 20))
    const otTardia = ot({ estado: 'CERRADA', creada: d(10, 12), termino: d(10, 15), cierre: d(10, 16), historial: [H('X', 'EN_VALIDACION', d(10, 15)), H('EN_VALIDACION', 'CERRADA', d(10, 16))] }, [d(10, 20)])
    expect(horas([otTardia])).toBe(8) // solo con la OT se perdían las 4 h previas
    expect(horas([detencion, otTardia])).toBe(12) // con el episodio: 08:00 → 20:00, sin doble descuento
  })
  it('OT creada posteriormente y liberación: una sola ventana unida', () => {
    const detencion = episodio(d(10, 8), d(11, 6))
    const o = ot({ estado: 'CERRADA', creada: d(10, 22), termino: d(11, 2), cierre: d(11, 3), historial: [H('X', 'EN_VALIDACION', d(11, 2)), H('EN_VALIDACION', 'CERRADA', d(11, 3))] }, [d(11, 6)])
    expect(horas([detencion, o])).toBe(22) // 10 08:00 → 11 06:00
  })
  it('episodio abierto (sin liberación) llega hasta el límite del periodo', () => {
    expect(horas([episodio(d(20, 8), null)])).toBe((d(30, 0).getTime() - d(20, 8).getTime()) / 3_600_000)
  })
  it('cambio de periodo 26–25: el episodio sin OT se reparte sin perder ni duplicar', () => {
    const e = episodio(d(25, 20), d(26, 4))
    const a = horas([e], { inicio: d(26, 0, 0, 8), termino: d(26, 0) }), b = horas([e], { inicio: d(26, 0), termino: d(25, 23, 59, 10) })
    expect(a).toBeCloseTo(4, 1); expect(b).toBeCloseTo(4, 1); expect(a + b).toBeCloseTo(8, 1)
  })
  it('modalidad HORA: las horas de la detención sin OT quedan como información, sin descuento adicional', () => {
    const asign = { id: 'A1', equipoId: 'E1', faenaId: 'F1', fechaInicio: d(1, 0), fechaTermino: null, modalidad: 'HORA' as const, tarifa: 50_000, politicaProrateo: 'DIAS_REALES' as const, reglaDescuentoDetencion: '100%' }
    const l = calcularLineaAsignacion(asign, ventana, [episodio(d(10, 8), d(10, 20))], [{ equipoId: 'E1', faenaId: 'F1', fecha: d(2, 0), horometro: 1000 }, { equipoId: 'E1', faenaId: 'F1', fecha: d(29, 0), horometro: 1100 }])
    expect(l.horasDetencion).toBe(12); expect(l.descuentoDetencion).toBe(0)
  })
})
