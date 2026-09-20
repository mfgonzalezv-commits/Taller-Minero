import { describe, expect, it } from 'vitest'
import { admiteReemplazo, compararVersiones, puedeTransicionarEP, violaSeparacionDeFunciones } from '../src/lib/estado-pago-maquina'
import { LIMITE_COMPRA_DIRECTA_FAENA, requiereAprobacionCentral, requiereAprobacionPorAcumulado, totalAcumulado } from '../src/lib/compra-directa'
import { evaluarLiberacion } from '../src/lib/liberacion'
import { validarTurno, normalizarTurno } from '../src/lib/turnos'
import { calcularAlertas, localAUtc, minutosLaborales, REGLAS, type SnapshotAlertas } from '../src/lib/alertas'
import * as P from '../src/lib/permisos-roles'

describe('límite de compra: $250.000 total final, IVA incluido', () => {
  it('el límite es exactamente $250.000 y desde ahí requiere aprobación central', () => {
    expect(LIMITE_COMPRA_DIRECTA_FAENA).toBe(250_000)
    expect(requiereAprobacionCentral(249_999)).toBe(false)
    expect(requiereAprobacionCentral(250_000)).toBe(true)
    expect(requiereAprobacionCentral(250_001)).toBe(true)
  })
})

describe('fraccionamiento: se mide el total acumulado de la necesidad', () => {
  it('varias compras bajo el límite que juntas lo alcanzan requieren aprobación', () => {
    expect(totalAcumulado(100_000, [100_000, 50_000])).toBe(250_000)
    expect(requiereAprobacionPorAcumulado(100_000, [100_000, 50_000])).toBe(true)
    expect(requiereAprobacionPorAcumulado(100_000, [100_000, 49_999])).toBe(false)
  })
  it('compras independientes (sin otras en la misma necesidad) no se bloquean', () => { expect(requiereAprobacionPorAcumulado(249_999, [])).toBe(false) })
})

describe('matriz de permisos de las decisiones', () => {
  it('Planificador de faena: compra, mantención, liberación y ajustes solicitados', () => {
    for (const lista of [P.ROLES_COMPRAR, P.ROLES_REGULARIZAR_COMPRA, P.ROLES_CREAR_PLAN, P.ROLES_LIBERAR_EQUIPO, P.ROLES_SOLICITAR_AJUSTE, P.ROLES_PROPONER_PAUTA]) expect(lista).toContain('PLANIFICADOR')
  })
  it('Planificador de faena NO aprueba compras ni ajustes ni pautas', () => {
    for (const lista of [P.ROLES_APROBAR_COMPRA_CENTRAL, P.ROLES_APROBAR_AJUSTE, P.ROLES_APROBAR_PAUTA]) { expect(lista).not.toContain('PLANIFICADOR'); expect(lista).not.toContain('PLANIFICADOR_CENTRAL'); expect(lista).not.toContain('JEFE_TALLER') }
  })
  it('Jefe Central aprueba compras, ajustes y pautas', () => {
    for (const lista of [P.ROLES_APROBAR_COMPRA_CENTRAL, P.ROLES_APROBAR_AJUSTE, P.ROLES_APROBAR_PAUTA]) expect(lista).toContain('JEFE_TALLER_CENTRAL')
  })
  it('Liberar: SOLO Jefe/Planificador de la faena; ni el ADMINISTRADOR ni los roles centrales', () => {
    expect([...P.ROLES_LIBERAR_EQUIPO].sort()).toEqual(['JEFE_TALLER', 'PLANIFICADOR'])
  })
  it('Aprobar ajustes, compras desde $250.000 y pautas: SOLO el Jefe de Taller Central', () => {
    for (const lista of [P.ROLES_APROBAR_AJUSTE, P.ROLES_APROBAR_COMPRA_CENTRAL, P.ROLES_APROBAR_PAUTA]) expect([...lista]).toEqual(['JEFE_TALLER_CENTRAL'])
  })
  it('Estados de Pago: prepara el Planificador Central y el ADMINISTRADOR; decide y anula SOLO Gerencia; el Jefe Central no prepara', () => {
    expect([...P.ROLES_PREPARAR_EP].sort()).toEqual(['ADMINISTRADOR', 'PLANIFICADOR_CENTRAL'])
    expect([...P.ROLES_DECIDIR_EP]).toEqual(['GERENCIA'])
    expect([...P.ROLES_ANULAR_EP]).toEqual(['GERENCIA'])
    expect(P.ROLES_PREPARAR_EP).not.toContain('JEFE_TALLER_CENTRAL')
  })
  it('el ADMINISTRADOR no reemplaza a NINGÚN aprobador operacional', () => {
    for (const lista of [P.ROLES_LIBERAR_EQUIPO, P.ROLES_APROBAR_AJUSTE, P.ROLES_APROBAR_COMPRA_CENTRAL, P.ROLES_APROBAR_PAUTA, P.ROLES_DECIDIR_EP, P.ROLES_ANULAR_EP]) expect(lista).not.toContain('ADMINISTRADOR')
  })
  it('no hay roles exclusivos de Bodega o Adquisiciones nuevos', () => { expect(P.ROLES_SOLICITAR_AJUSTE.filter(r => r === 'BODEGA').length).toBeLessThanOrEqual(1) })
})

describe('Estado de Pago: máquina, separación y versiones', () => {
  it('APROBADO solo puede ANULARSE; RECHAZADO y ANULADO son terminales', () => {
    expect(puedeTransicionarEP('APROBADO', 'ANULADO')).toBe(true)
    for (const d of ['PREPARADO', 'APROBADO', 'RECHAZADO'] as const) expect(puedeTransicionarEP('APROBADO', d)).toBe(false)
    for (const t of ['RECHAZADO', 'ANULADO'] as const) for (const d of ['PREPARADO', 'APROBADO', 'RECHAZADO', 'ANULADO'] as const) expect(puedeTransicionarEP(t, d)).toBe(false)
  })
  it('solo un documento rechazado o anulado se reemplaza', () => {
    expect(admiteReemplazo('RECHAZADO')).toBe(true); expect(admiteReemplazo('ANULADO')).toBe(true)
    expect(admiteReemplazo('APROBADO')).toBe(false); expect(admiteReemplazo('PREPARADO')).toBe(false)
  })
  it('el preparador no puede decidir sobre su propio documento', () => {
    expect(violaSeparacionDeFunciones('u1', 'u1')).toBe(true)
    expect(violaSeparacionDeFunciones('u1', 'u2')).toBe(false)
    expect(violaSeparacionDeFunciones(null, 'u2')).toBe(false)
  })
  it('las diferencias entre versiones detectan líneas nuevas, eliminadas y modificadas y los totales', () => {
    const l = (e: string, neto: number) => ({ equipoId: e, asignacionId: 'a', montoBruto: neto, descuentoDetencion: 0, montoNeto: neto })
    const d = compararVersiones({ totalBruto: 300, totalDescuentos: 0, totalNeto: 300, lineas: [l('A', 100), l('B', 200)] }, { totalBruto: 350, totalDescuentos: 0, totalNeto: 350, lineas: [l('A', 150), l('C', 200)] })
    expect(d.totales.neto).toBe(50)
    expect(d.lineas.map(x => `${x.equipoId}:${x.cambio}`).sort()).toEqual(['A:MODIFICADA', 'B:ELIMINADA', 'C:NUEVA'])
  })
  it('versiones idénticas no generan diferencias', () => {
    const l = { equipoId: 'A', asignacionId: null, montoBruto: 1, descuentoDetencion: 0, montoNeto: 1 }
    const v = { totalBruto: 1, totalDescuentos: 0, totalNeto: 1, lineas: [l] }
    expect(compararVersiones(v, v)).toEqual({ totales: { bruto: 0, descuentos: 0, neto: 0 }, lineas: [] })
  })
})

describe('liberación operacional', () => {
  const base = { estadoEquipo: 'DETENIDO', hayOtEnCurso: false, otReparada: null as { validadaTecnicamente: boolean } | null }
  it('sin reparación exige motivo', () => {
    expect(evaluarLiberacion({ ...base })).toMatch(/motivo/)
    expect(evaluarLiberacion({ ...base, motivo: ' ' })).toMatch(/motivo/)
    expect(evaluarLiberacion({ ...base, motivo: 'Falsa alarma revisada' })).toBeNull()
  })
  it('con reparación exige la validación técnica previa', () => {
    expect(evaluarLiberacion({ ...base, otReparada: { validadaTecnicamente: false } })).toMatch(/validación técnica/)
    expect(evaluarLiberacion({ ...base, otReparada: { validadaTecnicamente: true } })).toBeNull()
  })
  it('no libera con una OT en reparación ni un equipo que no está detenido', () => {
    expect(evaluarLiberacion({ ...base, hayOtEnCurso: true, motivo: 'x' })).toMatch(/en reparación/)
    expect(evaluarLiberacion({ ...base, estadoEquipo: 'OPERATIVO', motivo: 'x' })).toMatch(/no está detenido/)
  })
})

describe('turnos', () => {
  it('sistema y grupo válidos, opcionales y juntos', () => {
    expect(validarTurno({})).toBeNull()
    expect(validarTurno({ sistemaTurno: '7X7', grupoTurno: 'A' })).toBeNull()
    expect(validarTurno({ sistemaTurno: '14x14', grupoTurno: 'b' })).toBeNull()
    expect(validarTurno({ sistemaTurno: '7X7' })).toMatch(/juntos/)
    expect(validarTurno({ sistemaTurno: '5X2', grupoTurno: 'A' })).toMatch(/inválido/)
    expect(validarTurno({ sistemaTurno: '7X7', grupoTurno: 'C' })).toMatch(/inválido/)
    expect(normalizarTurno({ sistemaTurno: '14x14', grupoTurno: 'b' })).toEqual({ sistemaTurno: '14X14', grupoTurno: 'B' })
  })
})

// ── Alertas y escalamiento ───────────────────────────────────────────────────────────────────────────
// Referencia: miércoles 2026-09-16, 09:00 hora de Chile (UTC-3 en septiembre → 12:00 UTC).
const chile = (d: number, h: number, m = 0) => new Date(localAUtc(2026, 9, d, h, m))
const vacio = (ahora: Date): SnapshotAlertas => ({ ahora, hallazgosCriticos: [], otsCriticasSinResponsable: [], otsSinMovimiento: [], reparacionesPendientesValidacion: [], stockAgotado: [], comprasPendientes: [], faenasSinResponsable: [], comprasSospechosas: [], preventivos: [], estadosPago: [] })
const ev = (desde: Date) => [{ id: 'X', faenaId: 'F1', desde, detalle: 'detalle' }]
const claves = (s: SnapshotAlertas) => calcularAlertas(s).map(a => `${a.rolDestino}@${a.nivel}`)

describe('tiempo: continuo y horario laboral (Chile)', () => {
  it('la hora local de Chile se convierte bien (verano e invierno)', () => {
    expect(new Date(localAUtc(2026, 9, 16, 9)).toISOString()).toBe('2026-09-16T12:00:00.000Z') // septiembre: UTC-3
    expect(new Date(localAUtc(2026, 6, 16, 9)).toISOString()).toBe('2026-06-16T13:00:00.000Z') // junio: UTC-4
  })
  it('minutos laborales (San Ramón): todos los días, lunes a domingo, 08:00–18:00', () => {
    expect(minutosLaborales(chile(16, 9), chile(16, 11))).toBe(120)
    expect(minutosLaborales(chile(16, 17), chile(17, 9))).toBe(120) // 1 h del miércoles + 1 h del jueves
    expect(minutosLaborales(chile(18, 17), chile(21, 9))).toBe(60 + 600 + 600 + 60) // viernes 17→18, sábado y domingo completos, lunes 08→09
    expect(minutosLaborales(chile(19, 10), chile(20, 20))).toBe(480 + 600)          // el fin de semana también cuenta
    expect(minutosLaborales(chile(19, 20), chile(20, 6))).toBe(0)                    // de noche no cuenta
  })
})

describe('escalamiento: hallazgo crítico / equipo detenido (continuo)', () => {
  const desde = chile(19, 23, 0) // sábado de noche: lo crítico NO respeta el horario laboral
  it('inmediata al Planificador; 30 min Jefe Central; 2 h Planificador Central', () => {
    expect(claves({ ...vacio(new Date(desde.getTime() + 1 * 60000)), hallazgosCriticos: ev(desde) })).toEqual(['PLANIFICADOR@0'])
    expect(claves({ ...vacio(new Date(desde.getTime() + 29 * 60000)), hallazgosCriticos: ev(desde) })).toEqual(['PLANIFICADOR@0'])
    expect(claves({ ...vacio(new Date(desde.getTime() + 30 * 60000)), hallazgosCriticos: ev(desde) })).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1'])
    expect(claves({ ...vacio(new Date(desde.getTime() + 119 * 60000)), hallazgosCriticos: ev(desde) })).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1'])
    expect(claves({ ...vacio(new Date(desde.getTime() + 120 * 60000)), hallazgosCriticos: ev(desde) })).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1', 'PLANIFICADOR_CENTRAL@2'])
  })
  it('las claves únicas no cambian entre ejecuciones (idempotencia)', () => {
    const a = calcularAlertas({ ...vacio(new Date(desde.getTime() + 200 * 60000)), hallazgosCriticos: ev(desde) }), b = calcularAlertas({ ...vacio(new Date(desde.getTime() + 300 * 60000)), hallazgosCriticos: ev(desde) })
    expect(a.map(x => x.claveUnica)).toEqual(b.map(x => x.claveUnica))
    expect(new Set(a.map(x => x.claveUnica)).size).toBe(a.length)
  })
})

describe('escalamiento: OT crítica sin responsable', () => {
  it('inmediata al Planificador y a los 30 min al Jefe Central', () => {
    const d = chile(16, 9)
    expect(claves({ ...vacio(d), otsCriticasSinResponsable: ev(d) })).toEqual(['PLANIFICADOR@0'])
    expect(claves({ ...vacio(new Date(d.getTime() + 30 * 60000)), otsCriticasSinResponsable: ev(d) })).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1'])
  })
})

describe('escalamiento: OT normal sin movimiento (horario laboral)', () => {
  it('4 h → Planificador; 8 h → Jefe Central; 24 h → Planificador Central, contando solo horas laborales', () => {
    const d = chile(16, 8) // miércoles 08:00
    expect(claves({ ...vacio(chile(16, 11, 59)), otsSinMovimiento: ev(d) })).toEqual([])
    expect(claves({ ...vacio(chile(16, 12)), otsSinMovimiento: ev(d) })).toEqual(['PLANIFICADOR@0'])
    expect(claves({ ...vacio(chile(16, 16)), otsSinMovimiento: ev(d) })).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1'])
    // 24 h laborales = 2,4 días de 10 h: no se cumplen el jueves a la mañana
    expect(claves({ ...vacio(chile(17, 10)), otsSinMovimiento: ev(d) })).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1'])
    expect(claves({ ...vacio(chile(18, 16)), otsSinMovimiento: ev(d) })).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1', 'PLANIFICADOR_CENTRAL@2'])
  })
  it('una OT detenida el viernes en la tarde SÍ escala durante el fin de semana (se trabaja todos los días)', () => {
    const d = chile(18, 17) // viernes 17:00 (1 h hasta las 18:00)
    expect(claves({ ...vacio(chile(19, 10)), otsSinMovimiento: ev(d) })).toEqual([])                 // 1 h + 2 h el sábado
    expect(claves({ ...vacio(chile(19, 12)), otsSinMovimiento: ev(d) })).toEqual(['PLANIFICADOR@0']) // 1 h + 4 h
  })
  it('primer aviso al PLANIFICADOR de la faena (OT sin movimiento, OT crítica sin responsable y preventivo)', () => {
    expect(REGLAS.ot_sin_movimiento.pasos[0].rol).toBe('PLANIFICADOR')
    expect(REGLAS.ot_critica_sin_responsable.pasos[0].rol).toBe('PLANIFICADOR')
    expect(calcularAlertas({ ...vacio(chile(16, 9)), preventivos: [{ id: 'P', faenaId: 'F', detalle: 'x', diasRestantes: 3, horasRestantes: null, episodio: 'c' }] })[0].rolDestino).toBe('PLANIFICADOR')
  })
})

describe('episodios de alerta: no se duplican mientras el problema sigue y reaparecen si se resuelve y vuelve', () => {
  const ep1 = chile(16, 9), ep2 = chile(17, 15)
  it('el mismo episodio produce siempre las mismas claves (aunque pase el tiempo)', () => {
    const a = calcularAlertas({ ...vacio(new Date(ep1.getTime() + 60_000)), hallazgosCriticos: ev(ep1) }), b = calcularAlertas({ ...vacio(new Date(ep1.getTime() + 500 * 60_000)), hallazgosCriticos: ev(ep1) })
    expect(b.map(x => x.claveUnica).slice(0, a.length)).toEqual(a.map(x => x.claveUnica))
  })
  it('un problema que reaparece (nuevo inicio) genera claves NUEVAS aunque sea la misma entidad', () => {
    const a = calcularAlertas({ ...vacio(new Date(ep1.getTime() + 60_000)), hallazgosCriticos: ev(ep1) }), b = calcularAlertas({ ...vacio(new Date(ep2.getTime() + 60_000)), hallazgosCriticos: ev(ep2) })
    expect(a.every(x => !b.some(y => y.claveUnica === x.claveUnica))).toBe(true)
    expect(b[0].nivel).toBe(0) // vuelve a empezar por el primer aviso
  })
  it('recordatorios y escalamientos siguen dentro del episodio vigente', () => {
    const r = calcularAlertas({ ...vacio(new Date(ep1.getTime() + 121 * 60_000)), reparacionesPendientesValidacion: ev(ep1) })
    expect(r.map(x => x.claveUnica.split(':').slice(-1)[0])).toEqual(['0', '1'])
    expect(new Set(r.map(x => x.claveUnica.split(':')[2]))).toEqual(new Set([String(ep1.getTime())]))
  })
  it('un preventivo reprogramado (nuevo ciclo) genera una alerta nueva', () => {
    const p = (episodio: string) => calcularAlertas({ ...vacio(chile(16, 9)), preventivos: [{ id: 'P', faenaId: 'F', detalle: 'x', diasRestantes: 3, horasRestantes: null, episodio }] })[0].claveUnica
    expect(p('c1')).not.toBe(p('c2')); expect(p('c1')).toBe(p('c1'))
  })
})

describe('faena sin responsable y compras fraccionadas', () => {
  it('equipos detenidos sin Jefe ni Planificador: avisa de inmediato al Jefe Central y al Planificador Central', () => {
    const r = calcularAlertas({ ...vacio(chile(16, 9)), faenasSinResponsable: [{ id: 'F1', faenaId: 'F1', desde: chile(16, 8), detalle: 'sin responsable' }] })
    expect(r.map(a => a.rolDestino).sort()).toEqual(['JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  })
  it('varias compras directas de la misma OT en 24 h dejan una alerta de REVISIÓN al Jefe Central (no bloquea)', () => {
    const r = calcularAlertas({ ...vacio(chile(16, 9)), comprasSospechosas: [{ id: 'OT1:1', faenaId: 'F1', desde: chile(16, 8), detalle: 'revisar' }] })
    expect(r.map(a => a.rolDestino)).toEqual(['JEFE_TALLER_CENTRAL'])
  })
})

describe('escalamiento: reparación pendiente de validación (continuo)', () => {
  it('inmediata al Jefe Central; recordatorio a las 2 h; a las 4 h al Planificador Central', () => {
    const d = chile(19, 22)
    const r = (min: number) => calcularAlertas({ ...vacio(new Date(d.getTime() + min * 60000)), reparacionesPendientesValidacion: ev(d) })
    expect(r(0).map(a => a.rolDestino)).toEqual(['JEFE_TALLER_CENTRAL'])
    expect(r(119).length).toBe(1)
    expect(r(120).map(a => a.titulo).some(t => t.startsWith('Recordatorio'))).toBe(true)
    expect(r(239).map(a => a.rolDestino)).toEqual(['JEFE_TALLER_CENTRAL', 'JEFE_TALLER_CENTRAL'])
    expect(r(240).map(a => a.rolDestino)).toEqual(['JEFE_TALLER_CENTRAL', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  })
})

describe('escalamiento: stock crítico agotado (continuo)', () => {
  it('inmediata al Planificador; 1 h Jefe Central; 4 h Planificador Central', () => {
    const d = chile(20, 3)
    const r = (min: number) => claves({ ...vacio(new Date(d.getTime() + min * 60000)), stockAgotado: ev(d) })
    expect(r(0)).toEqual(['PLANIFICADOR@0']); expect(r(59)).toEqual(['PLANIFICADOR@0'])
    expect(r(60)).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1']); expect(r(240)).toEqual(['PLANIFICADOR@0', 'JEFE_TALLER_CENTRAL@1', 'PLANIFICADOR_CENTRAL@2'])
  })
})

describe('escalamiento: compra desde $250.000 pendiente (horario laboral)', () => {
  it('inmediata al Jefe Central; recordatorio 4 h; 8 h Planificador Central', () => {
    const d = chile(16, 8)
    const r = (h: number, m = 0) => calcularAlertas({ ...vacio(chile(16, h, m)), comprasPendientes: ev(d) })
    expect(r(8).map(a => a.rolDestino)).toEqual(['JEFE_TALLER_CENTRAL'])
    expect(r(11, 59).length).toBe(1)
    expect(r(12).length).toBe(2); expect(r(12)[1].titulo).toMatch(/Recordatorio/)
    expect(calcularAlertas({ ...vacio(chile(17, 9)), comprasPendientes: ev(d) }).map(a => a.rolDestino)).toEqual(['JEFE_TALLER_CENTRAL', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  })
})

describe('preventivos', () => {
  const p = (dias: number | null, horas: number | null) => ({ id: 'P1', faenaId: 'F1', detalle: 'CAM-01 PM 250h', diasRestantes: dias, horasRestantes: horas, episodio: 'ciclo-1' })
  it('próximo: 7 días o 50 horas antes (una vez)', () => {
    const ahora = chile(16, 9)
    expect(calcularAlertas({ ...vacio(ahora), preventivos: [p(8, 60)] })).toEqual([])
    expect(calcularAlertas({ ...vacio(ahora), preventivos: [p(7, null)] }).map(a => a.tipo)).toEqual(['preventivo_proximo'])
    expect(calcularAlertas({ ...vacio(ahora), preventivos: [p(null, 50)] }).map(a => a.tipo)).toEqual(['preventivo_proximo'])
    expect(calcularAlertas({ ...vacio(chile(17, 9)), preventivos: [p(7, null)] })[0].claveUnica).toBe(calcularAlertas({ ...vacio(chile(16, 9)), preventivos: [p(7, null)] })[0].claveUnica)
  })
  it('vencido: una alerta por día', () => {
    const a = calcularAlertas({ ...vacio(chile(16, 9)), preventivos: [p(-1, null)] }), b = calcularAlertas({ ...vacio(chile(17, 9)), preventivos: [p(-2, null)] })
    expect(a[0].tipo).toBe('preventivo_vencido'); expect(a[0].claveUnica).not.toBe(b[0].claveUnica)
    expect(calcularAlertas({ ...vacio(chile(16, 9)), preventivos: [p(-1, null)] })[0].claveUnica).toBe(a[0].claveUnica) // mismo día = misma clave
  })
})

describe('Estado de Pago: 3 días antes del 25, día 25 y atraso', () => {
  const ep = (hayPreparado: boolean, hayAprobado = false) => ({ faenaId: 'F1', faenaNombre: 'San Ramón', periodoTermino: new Date(localAUtc(2026, 9, 25, 23, 59)), hayPreparado, hayAprobado })
  const dia = (d: number) => calcularAlertas({ ...vacio(chile(d, 10)), estadosPago: [ep(false)] }).map(a => `${a.rolDestino}:${a.tipo}`)
  it('a 4 días no avisa; a 3 días avisa al Planificador Central', () => { expect(dia(21)).toEqual([]); expect(dia(22)).toEqual(['PLANIFICADOR_CENTRAL:ep_antes']) })
  it('el día 25 avisa al Planificador Central', () => { expect(dia(25)).toEqual(['PLANIFICADOR_CENTRAL:ep_cierre']) })
  it('el atraso (día 26 en adelante, sobre el periodo que cerró) avisa a Gerencia', () => { expect(dia(26)).toEqual(['GERENCIA:ep_atraso']); expect(dia(28)).toEqual(['GERENCIA:ep_atraso']) })
  it('si ya está aprobado no avisa nada; si está preparado no hay aviso previo', () => {
    expect(calcularAlertas({ ...vacio(chile(26, 10)), estadosPago: [ep(true, true)] })).toEqual([])
    expect(calcularAlertas({ ...vacio(chile(22, 10)), estadosPago: [ep(true)] })).toEqual([])
  })
})

describe('reglas: solo notificaciones internas', () => {
  it('cada regla tiene destinatarios de rol, sin correo ni WhatsApp', () => {
    for (const r of Object.values(REGLAS)) for (const p of r.pasos) expect(['PLANIFICADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'GERENCIA']).toContain(p.rol)
  })
  it('las alertas críticas usan tiempo continuo y las administrativas horario laboral', () => {
    for (const t of ['hallazgo_critico', 'ot_critica_sin_responsable', 'reparacion_pendiente_validacion', 'stock_critico_agotado']) expect(REGLAS[t].modo).toBe('continuo')
    for (const t of ['ot_sin_movimiento', 'compra_pendiente_aprobacion']) expect(REGLAS[t].modo).toBe('laboral')
  })
})
