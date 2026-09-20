// Regresión AUD-013 a AUD-019: inspecciones, alertas, SR, compra directa y bitácora.
// Contra erp_minera_dev (SIM-01/SIM-02). Incluye aislamiento entre faenas, doble clic,
// concurrencia y rollback. Falla si alguna verificación no se cumple.
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { crearPlantilla, crearInspeccion, actualizarEstadoAlerta, generarOTDesdeAlerta } from '../src/actions/inspeccion'
import { crearSR, cambiarEstadoSR, marcarCompraDirecta, regularizarCompraDirecta, aprobarCompraDirectaCentral, solicitarAprobacionCompra } from '../src/actions/sr'
import { agregarBitacora } from '../src/actions/ot'

type Paso = { paso: string; ok: boolean; detalle: string }
const pasos: Paso[] = []

describe('inspecciones, SR y compras (regresión AUD-013 a AUD-019)', () => {
  afterAll(() => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'inspeccion-compras.json'), JSON.stringify(pasos, null, 2)) })
  it('ejecuta', async () => {
    const faena = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })
    const sim1 = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-01' } })
    const compras = await prisma.usuario.upsert({
      where: { email: 'compras2@sim2.local' }, update: {},
      create: { faenaId: faena.id, nombre: 'Sim2 compras', email: 'compras2@sim2.local', password: (await prisma.usuario.findUniqueOrThrow({ where: { email: 'jefe2@sim2.local' } })).password, rol: 'COMPRAS' },
    })
    const S = { jefe: await sesionDe('jefe2@sim2.local'), op: await sesionDe('operador2@sim2.local'), mec: await sesionDe('mecanico2b@sim2.local'), plan: await sesionDe('plan2@sim2.local'), bod: await sesionDe('bodega2@sim2.local'), C: await sesionDe(compras.email), central: await sesionDe('jefecentral@sim.local'), op1: await sesionDe('operador@sim.local'), jefe1: await sesionDe('jefe@sim.local') }
    const eq = await prisma.equipo.findFirstOrThrow({ where: { faenaId: faena.id, codigo: 'SIM2-EQ-02' } })
    const eq1 = await prisma.equipo.findFirstOrThrow({ where: { faenaId: sim1.id } })
    const ot = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: faena.id } })
    const item = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: faena.id } })

    const chequear = (paso: string, ok: boolean, detalle = 'ok') => pasos.push({ paso, ok, detalle: ok ? 'ok' : detalle })
    const espera = async (paso: string, s: unknown, fn: () => Promise<unknown>, patron: RegExp) => {
      como(s)
      try { await fn(); chequear(paso, false, 'debía ser rechazado y fue permitido') }
      catch (e) { const m = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' '); chequear(paso, patron.test(m), `mensaje inesperado: ${m.slice(0, 140)}`) }
    }
    const exito = async <T,>(paso: string, s: unknown, fn: () => Promise<T>): Promise<T | undefined> => {
      como(s)
      try { const r = await fn(); chequear(paso, true); return r } catch (e) { chequear(paso, false, (e instanceof Error ? e.message : String(e)).slice(0, 160)); return undefined }
    }
    const stockLotes = async () => {
      const it = await prisma.itemBodega.findUniqueOrThrow({ where: { id: item.id } })
      const lotes = (await prisma.loteBodega.findMany({ where: { itemId: item.id } })).reduce((a, l) => a + Number(l.cantidadSaldo), 0)
      return { stock: Number(it.stockActual), lotes }
    }

    // ── Inspección ───────────────────────────────────────────────────────────
    await espera('Operador NO crea plantilla', S.op, () => crearPlantilla({ equipoId: eq.id, nombre: 'AUDIT op', items: [] }), /Sin permisos/)
    await exito('Jefe crea plantilla', S.jefe, () => crearPlantilla({ equipoId: eq.id, nombre: 'AUDIT plantilla', items: [
      { categoria: 'Motor', descripcion: 'Nivel de aceite', criticidadBase: 'OBSERVACION' as never, orden: 1 },
      { categoria: 'Frenos', descripcion: 'Freno de servicio', criticidadBase: 'CRITICO' as never, orden: 2 },
    ] }))
    const plt = await prisma.plantillaInspeccion.findFirstOrThrow({ where: { faenaId: faena.id, nombre: 'AUDIT plantilla' }, include: { items: { orderBy: { orden: 'asc' } } } })
    const [iAceite, iFreno] = plt.items
    const base = { equipoId: eq.id, plantillaId: plt.id, turno: 'MAÑANA' as never }
    const crit = (obs: string) => [{ itemId: iAceite.id, resultado: 'OK' as never }, { itemId: iFreno.id, resultado: 'CRITICO' as never, observacion: obs }]

    await exito('Inspección todo OK', S.op, () => crearInspeccion({ ...base, resultados: [{ itemId: iAceite.id, resultado: 'OK' as never }, { itemId: iFreno.id, resultado: 'OK' as never }] }))
    let e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
    chequear('Todo OK: sin alertas y equipo operativo', (await prisma.alertaInspeccion.count({ where: { equipoId: eq.id } })) === 0 && e.estado === 'OPERATIVO', e.estado)

    const K1 = 'audit-k1-' + Date.now()
    const r1 = await exito('Hallazgo crítico (clave K1)', S.op, () => crearInspeccion({ ...base, resultados: crit('AUDIT sin frenos'), claveIdempotencia: K1 }))
    e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
    const rep1 = await prisma.reporteFalla.findMany({ where: { inspeccionId: r1?.inspeccionId } })
    chequear('Crítico: 1 reporte vinculado, equipo detenido pendiente de validación', rep1.length === 1 && e.estado === 'DETENIDO_PENDIENTE_VALIDACION' && rep1[0].reincidenciaDeId === null, JSON.stringify({ rep: rep1.length, estado: e.estado }))
    const total0 = await prisma.reporteFalla.count({ where: { equipoId: eq.id } })
    const repetida = await exito('Repetir la misma operación (K1)', S.op, () => crearInspeccion({ ...base, resultados: crit('AUDIT sin frenos'), claveIdempotencia: K1 }))
    chequear('La repetición devuelve la misma inspección y el mismo reporte, sin duplicar', repetida?.inspeccionId === r1?.inspeccionId && repetida?.reporteId === rep1[0]?.id && (await prisma.reporteFalla.count({ where: { equipoId: eq.id } })) === total0 && (await prisma.inspeccionDiaria.count({ where: { claveIdempotencia: K1 } })) === 1, JSON.stringify(repetida))

    const K2 = 'audit-k2-' + Date.now()
    como(S.op)
    const dobles = await Promise.allSettled([crearInspeccion({ ...base, resultados: crit('AUDIT doble clic'), claveIdempotencia: K2 }), crearInspeccion({ ...base, resultados: crit('AUDIT doble clic'), claveIdempotencia: K2 })])
    const insK2 = await prisma.inspeccionDiaria.findMany({ where: { claveIdempotencia: K2 } })
    const repK2 = await prisma.reporteFalla.findMany({ where: { inspeccionId: insK2[0]?.id } })
    chequear('Doble clic simultáneo (K2): ambas OK, 1 inspección y 1 reporte', dobles.every(d => d.status === 'fulfilled') && insK2.length === 1 && repK2.length === 1, JSON.stringify({ r: dobles.map(d => d.status), ins: insK2.length, rep: repK2.length }))
    chequear('El reporte de la 2ª inspección crítica es reincidencia del primero', repK2[0]?.reincidenciaDeId === rep1[0]?.id, String(repK2[0]?.reincidenciaDeId))

    const r3 = await exito('Nueva inspección crítica (sin clave)', S.op, () => crearInspeccion({ ...base, resultados: crit('AUDIT nueva') }))
    const rep3 = await prisma.reporteFalla.findMany({ where: { inspeccionId: r3?.inspeccionId } })
    chequear('Una nueva inspección crea un reporte nuevo marcado como reincidencia', rep3.length === 1 && rep3[0].reincidenciaDeId !== null, JSON.stringify(rep3.map(r => r.reincidenciaDeId)))

    const antesIns = await prisma.inspeccionDiaria.count({ where: { faenaId: faena.id } })
    const antesAl = await prisma.alertaInspeccion.count({ where: { faenaId: faena.id } })
    como(S.op)
    let fallo = false
    try { await crearInspeccion({ ...base, resultados: [{ itemId: iAceite.id, resultado: 'OK' as never }, { itemId: iFreno.id, resultado: 'INVENTADO' as never }] }) } catch { fallo = true }
    chequear('Rollback: si falla a mitad no queda inspección ni alerta a medias', fallo && (await prisma.inspeccionDiaria.count({ where: { faenaId: faena.id } })) === antesIns && (await prisma.alertaInspeccion.count({ where: { faenaId: faena.id } })) === antesAl, `fallo=${fallo}`)

    const plt1 = await prisma.plantillaInspeccion.findFirst({ where: { faenaId: sim1.id } })
    const estadoEq1Antes = eq1.estado
    await espera('Operador SIM-02 NO inspecciona equipo de SIM-01', S.op, () => crearInspeccion({ ...base, equipoId: eq1.id, resultados: crit('AUDIT cross') }), /Sin permisos/)
    const eq1d = await prisma.equipo.findUniqueOrThrow({ where: { id: eq1.id } })
    chequear('El equipo de SIM-01 conserva su estado y no recibe alertas nuevas', eq1d.estado === estadoEq1Antes && (await prisma.alertaInspeccion.count({ where: { equipoId: eq1.id, descripcion: { contains: 'AUDIT' } } })) === 0, eq1d.estado)
    await espera('Operador SIM-01 NO inspecciona equipo de SIM-02', S.op1, () => crearInspeccion({ ...base, resultados: crit('AUDIT cross') }), /Sin permisos/)
    if (plt1) await espera('Operador SIM-02 NO usa plantilla de SIM-01', S.op, () => crearInspeccion({ equipoId: eq.id, plantillaId: plt1.id, turno: 'MAÑANA' as never, resultados: [] }), /Sin permisos/)
    await espera('Ítem que no es de la plantilla se rechaza', S.op, () => crearInspeccion({ ...base, resultados: [{ itemId: '00000000-0000-4000-8000-000000000000', resultado: 'OK' as never }] }), /Sin permisos/)
    await espera('Bodega NO inspecciona', S.bod, () => crearInspeccion({ ...base, resultados: [] }), /Sin permisos/)

    const alerta = await prisma.alertaInspeccion.findFirstOrThrow({ where: { equipoId: eq.id, inspeccionId: r1?.inspeccionId } })
    await espera('Operador NO cambia estado de alerta', S.op, () => actualizarEstadoAlerta(alerta.id, 'EN_PROCESO'), /Sin permisos/)
    await espera('Operador NO convierte alerta en OT', S.op, () => generarOTDesdeAlerta(alerta.id), /Sin permisos/)
    await espera('Jefe de OTRA faena (SIM-01) no convierte la alerta', S.jefe1, () => generarOTDesdeAlerta(alerta.id), /Sin permisos/)
    como(S.jefe)
    const gen = await Promise.allSettled([generarOTDesdeAlerta(alerta.id), generarOTDesdeAlerta(alerta.id)])
    const ids = gen.flatMap(g => g.status === 'fulfilled' ? [g.value] : [])
    const otsAlerta = await prisma.ordenTrabajo.count({ where: { descripcionFalla: { contains: alerta.descripcion }, equipoId: eq.id } })
    chequear('Dos conversiones simultáneas: 1 sola OT y ambas devuelven la misma', gen.every(g => g.status === 'fulfilled') && ids[0] === ids[1] && otsAlerta === 1, JSON.stringify({ r: gen.map(g => g.status), ots: otsAlerta }))
    const otra = await exito('Tercera conversión (secuencial)', S.jefe, () => generarOTDesdeAlerta(alerta.id))
    chequear('Sigue habiendo 1 OT para la alerta y se devuelve la misma', otra === ids[0] && (await prisma.ordenTrabajo.count({ where: { descripcionFalla: { contains: alerta.descripcion }, equipoId: eq.id } })) === 1)

    await espera('Bitácora con estado que salta la máquina se rechaza con mensaje', S.mec, () => agregarBitacora(ot.id, { descripcion: 'AUDIT', estado: 'EN_REPARACION' }), /Transición no permitida/)
    await espera('Bitácora que intenta cerrar se rechaza con mensaje', S.mec, () => agregarBitacora(ot.id, { descripcion: 'AUDIT', estado: 'CERRADA' }), /no puede pasar la OT a CERRADA/)
    await exito('Bitácora sin estado se guarda normalmente', S.mec, () => agregarBitacora(ot.id, { descripcion: 'AUDIT sin estado' }))

    // ── SR ───────────────────────────────────────────────────────────────────
    await espera('Operador NO crea SR', S.op, () => crearSR(ot.id, { items: [{ descripcion: 'AUDIT', cantidad: 1, unidad: 'un' }], urgente: false }), /Sin permisos/)
    await exito('Mecánico crea SR (2 unidades de bodega)', S.mec, () => crearSR(ot.id, { items: [{ descripcion: 'Repuesto SIM-02', cantidad: 2, unidad: 'un', itemBodegaId: item.id, precioEstimado: 1 }], urgente: true }))
    const sr = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: ot.id }, orderBy: { createdAt: 'desc' } })
    await espera('Mecánico NO cambia estado de la SR', S.mec, () => cambiarEstadoSR(sr.id, 'EN_BODEGA_CENTRAL'), /Sin permisos/)
    await espera('No se salta de ENVIADA a EN_ADQUISICIONES', S.jefe, () => cambiarEstadoSR(sr.id, 'EN_ADQUISICIONES'), /Transición no permitida/)
    for (const est of ['EN_BODEGA_CENTRAL', 'EN_ADQUISICIONES', 'ESPERANDO_LLEGADA', 'RECIBIDA_FAENA'] as const) await exito(`SR → ${est}`, est === 'EN_ADQUISICIONES' || est === 'ESPERANDO_LLEGADA' ? S.C : S.jefe, () => cambiarEstadoSR(sr.id, est, { observacion: 'AUDIT' }))
    const s0 = await stockLotes()
    como(S.bod)
    const ent = await Promise.allSettled([cambiarEstadoSR(sr.id, 'ENTREGADA'), cambiarEstadoSR(sr.id, 'ENTREGADA')])
    const s1 = await stockLotes()
    chequear('Entrega doble simultánea: ambas OK, stock descontado UNA vez (-2) y lotes alineados', ent.every(x => x.status === 'fulfilled') && s1.stock === s0.stock - 2 && s1.lotes === s1.stock, JSON.stringify({ r: ent.map(x => x.status), s0, s1 }))
    chequear('Un solo historial ENTREGADA y un solo repuesto entregado', (await prisma.historialSR.count({ where: { srId: sr.id, estadoNuevo: 'ENTREGADA' } })) === 1 && (await prisma.repuestoOT.count({ where: { otId: ot.id, descripcion: 'Repuesto SIM-02', estadoSolicitud: 'ENTREGADO' } })) === 1)
    await exito('Entregar otra vez (secuencial) no falla ni descuenta', S.bod, () => cambiarEstadoSR(sr.id, 'ENTREGADA'))
    chequear('Stock intacto tras la 3ª entrega', (await stockLotes()).stock === s1.stock)
    await espera('ENTREGADA es terminal (→ ENVIADA)', S.jefe, () => cambiarEstadoSR(sr.id, 'ENVIADA'), /Transición no permitida/)

    await exito('SR de 999 unidades', S.mec, () => crearSR(ot.id, { items: [{ descripcion: 'AUDIT gigante', cantidad: 999, unidad: 'un', itemBodegaId: item.id }], urgente: false }))
    const srG = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: ot.id }, orderBy: { createdAt: 'desc' } })
    await exito('SR gigante → RECIBIDA_FAENA', S.jefe, () => cambiarEstadoSR(srG.id, 'RECIBIDA_FAENA'))
    const sAntes = await stockLotes()
    await espera('Entregar más de lo que hay se rechaza', S.bod, () => cambiarEstadoSR(srG.id, 'ENTREGADA'), /Stock insuficiente/)
    const srGd = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srG.id } })
    chequear('Rollback: la SR sigue RECIBIDA_FAENA, sin repuestos y stock intacto', srGd.estado === 'RECIBIDA_FAENA' && (await prisma.repuestoOT.count({ where: { otId: ot.id, descripcion: 'AUDIT gigante' } })) === 0 && (await stockLotes()).stock === sAntes.stock, srGd.estado)
    await espera('RECIBIDA_FAENA no se puede rechazar (solo avanza)', S.jefe, () => cambiarEstadoSR(srG.id, 'RECHAZADA'), /Transición no permitida/)
    await exito('SR nueva para cancelar', S.mec, () => crearSR(ot.id, { items: [{ descripcion: 'AUDIT cancelar', cantidad: 1, unidad: 'un' }], urgente: false }))
    const srX = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: ot.id }, orderBy: { createdAt: 'desc' } })
    await exito('Rechazar (cancelar) la SR', S.jefe, () => cambiarEstadoSR(srX.id, 'RECHAZADA'))
    await espera('RECHAZADA es terminal', S.jefe, () => cambiarEstadoSR(srX.id, 'ENVIADA'), /Transición no permitida/)

    // ── Compra directa ───────────────────────────────────────────────────────
    await exito('SR para compra directa', S.jefe, () => crearSR(ot.id, { items: [{ descripcion: 'AUDIT compra urgente', cantidad: 1, unidad: 'un', precioEstimado: 600000 }], urgente: true }))
    const sr2 = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: ot.id, items: { some: { descripcion: 'AUDIT compra urgente' } } } })
    const datos = { cotizaciones: ['COT-1 $590.000'], comprobante: 'FAC-9001', motivo: 'Emergencia: equipo detenido', monto: 600000 }
    await espera('Regularizar antes de marcar compra directa se rechaza', S.C, () => regularizarCompraDirecta(sr2.id, datos), /no es una compra directa/)
    await espera('Bodega NO marca compra directa', S.bod, () => marcarCompraDirecta(sr2.id, 'AUDIT', 600000), /Sin permisos/)
    await espera('Compra directa sin motivo se rechaza', S.jefe, () => marcarCompraDirecta(sr2.id, ' ', 600000), /justificar/)
    como(S.jefe)
    const marc = await Promise.allSettled([marcarCompraDirecta(sr2.id, 'Emergencia sin cotizaciones previas', 600000), marcarCompraDirecta(sr2.id, 'Emergencia sin cotizaciones previas', 600000)])
    chequear('Marcar compra directa es idempotente (doble clic)', marc.every(m => m.status === 'fulfilled') && (await prisma.registroAuditoria.count({ where: { entidadId: sr2.id, accion: 'MARCAR_COMPRA_DIRECTA' } })) === 1)
    await espera('Bodega NO regulariza', S.bod, () => regularizarCompraDirecta(sr2.id, datos), /Sin permisos/)
    await espera('Regularizar sin cotización se rechaza', S.C, () => regularizarCompraDirecta(sr2.id, { ...datos, cotizaciones: [] }), /cotización/)
    await espera('Regularizar sin comprobante se rechaza', S.C, () => regularizarCompraDirecta(sr2.id, { ...datos, comprobante: '' }), /comprobante/)
    await espera('Regularizar sin motivo se rechaza', S.C, () => regularizarCompraDirecta(sr2.id, { ...datos, motivo: '' }), /motivo/)
    await espera('Un monto informado bajo (1) no evade el límite: se controla con lo estimado de la SR', S.C, () => regularizarCompraDirecta(sr2.id, { ...datos, monto: 1 }), /aprobación central/)
    await espera('Sobre el límite de faena exige aprobación central', S.C, () => regularizarCompraDirecta(sr2.id, datos), /aprobación central/)
    await espera('El Jefe de faena NO da la aprobación central', S.jefe, () => aprobarCompraDirectaCentral(sr2.id), /Sin permisos/)
    await exito('La faena solicita la aprobación central', S.plan, () => solicitarAprobacionCompra(sr2.id, 600000))
    await exito('Central aprueba', S.central, () => aprobarCompraDirectaCentral(sr2.id))
    como(S.C)
    const reg = await Promise.allSettled([regularizarCompraDirecta(sr2.id, datos), regularizarCompraDirecta(sr2.id, datos)])
    const srR = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: sr2.id } })
    chequear('Regularización doble simultánea: ambas OK, se aplica una sola vez con su respaldo', reg.every(r => r.status === 'fulfilled') && srR.regularizada && srR.comprobanteRegularizacion === 'FAC-9001' && srR.cotizaciones.length === 1 && (await prisma.registroAuditoria.count({ where: { entidadId: sr2.id, accion: 'REGULARIZAR_COMPRA_DIRECTA' } })) === 1, JSON.stringify({ r: reg.map(r => r.status), regularizada: srR.regularizada }))
    await exito('Regularizar de nuevo con otros datos no cambia nada', S.C, () => regularizarCompraDirecta(sr2.id, { ...datos, comprobante: 'OTRO', cotizaciones: ['X', 'Y'] }))
    const srR2 = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: sr2.id } })
    chequear('El respaldo original se conserva (idempotente)', srR2.comprobanteRegularizacion === 'FAC-9001' && srR2.cotizaciones.length === 1)
    const enviados = await prisma.correoSaliente.count({ where: { estado: 'ENVIADO' } })
    chequear('Ningún correo se envió (solo cola/outbox)', enviados === 0, String(enviados))

    const fallos = pasos.filter(p => !p.ok)
    expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([])
  })
})
