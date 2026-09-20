// Regresión de las decisiones operacionales (San Ramón): permisos, límite de $250.000, ajustes de stock,
// liberación, Estados de Pago (separación, versiones, anulación), pautas versionadas, turnos y alertas.
// Solo erp_minera_dev (SIM-01 / SIM-02). Falla si algo no se cumple.
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { crearSR, marcarCompraDirecta, regularizarCompraDirecta, solicitarAprobacionCompra, aprobarCompraDirectaCentral, rechazarAprobacionCompra, cancelarCompraDirecta } from '../src/actions/sr'
import { registrarMovimiento, solicitarAjusteStock, aprobarAjusteStock, rechazarAjusteStock, transferirStockEntreFaenas } from '../src/actions/bodega'
import { crearReporteFalla, validarDetencion, convertirReporteEnOT } from '../src/actions/fallas'
import { cambiarEstadoOT, validarTecnicamente, crearOT } from '../src/actions/ot'
import { liberarEquipo, actualizarEstadoEquipo } from '../src/actions/equipos'
import { autorizarOperarConObservacion } from '../src/actions/inspeccion'
import { prepararEstadoPago, aprobarEstadoPago, rechazarEstadoPago, anularEstadoPago, reemplazarEstadoPago, agregarAjusteManual, getVersionesEstadoPago } from '../src/actions/estadoPago'
import { proponerPautaNueva, proponerVersionPauta, aprobarPauta, vincularPautaEquipo, programarPM } from '../src/actions/pautas'
import { crearPlan, programarParada, postergarPlan } from '../src/actions/mantenimiento'
import { crearUsuario, actualizarUsuario } from '../src/actions/usuarios'
import { getAlertasInternas } from '../src/actions/alertas'
import { procesarAlertas } from '../src/lib/alertas-servicio'

type Paso = { paso: string; ok: boolean; detalle: string }
const pasos: Paso[] = []

describe('decisiones operacionales (SIM-02)', () => {
  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { email: { startsWith: 'audit.turno' } } }).catch(() => {})
    fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'decisiones.json'), JSON.stringify(pasos, null, 2))
  })
  it('ejecuta', async () => {
    const chequear = (paso: string, ok: boolean, detalle = 'ok') => pasos.push({ paso, ok, detalle: ok ? 'ok' : detalle })
    const espera = async (paso: string, s: unknown, fn: () => Promise<unknown>, patron: RegExp) => {
      como(s)
      try { await fn(); chequear(paso, false, 'debía ser rechazado y fue permitido') }
      catch (e) { const m = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' '); chequear(paso, patron.test(m), `mensaje inesperado: ${m.slice(0, 150)}`) }
    }
    const exito = async <T,>(paso: string, s: unknown, fn: () => Promise<T>): Promise<T | undefined> => {
      como(s)
      try { const r = await fn(); chequear(paso, true); return r } catch (e) { chequear(paso, false, (e instanceof Error ? e.message : String(e)).slice(0, 180)); return undefined }
    }

    const faena = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })
    const sim1 = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-01' } })
    await prisma.usuario.upsert({ where: { email: 'gerencia@sim.local' }, update: {}, create: { faenaId: sim1.id, nombre: 'Sim gerencia', email: 'gerencia@sim.local', password: 'x', rol: 'GERENCIA' } })
    const S = {
      jefe: await sesionDe('jefe2@sim2.local'), plan: await sesionDe('plan2@sim2.local'), mec: await sesionDe('mecanico2b@sim2.local'), bod: await sesionDe('bodega2@sim2.local'), op: await sesionDe('operador2@sim2.local'),
      central: await sesionDe('jefecentral@sim.local'), planC: await sesionDe('plancentral@sim.local'), adm: await sesionDe('admin@sim.local'), ger: await sesionDe('gerencia@sim.local'),
      jefe1: await sesionDe('jefe@sim.local'), plan1: await sesionDe('planificador@sim.local'),
    }
    const item = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: faena.id } })
    const eq1 = await prisma.equipo.findFirstOrThrow({ where: { faenaId: faena.id, codigo: 'SIM2-EQ-01' } })
    const eq2 = await prisma.equipo.findFirstOrThrow({ where: { faenaId: faena.id, codigo: 'SIM2-EQ-02' } })
    const ot = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: faena.id } })
    const stockLotes = async () => {
      const it = await prisma.itemBodega.findUniqueOrThrow({ where: { id: item.id } })
      return { stock: Number(it.stockActual), lotes: (await prisma.loteBodega.findMany({ where: { itemId: item.id } })).reduce((a, l) => a + Number(l.cantidadSaldo), 0) }
    }
    const auditorias = (entidadId: string, accion: string) => prisma.registroAuditoria.count({ where: { entidadId, accion } })

    // ── A. Compras: límite exacto de $250.000 ─────────────────────────────────────────────────────────
    const nuevaCompra = async (nombre: string, precio: number) => {
      await exito(`SR ${nombre}`, S.jefe, () => crearSR(ot.id, { items: [{ descripcion: nombre, cantidad: 1, unidad: 'un', precioEstimado: precio }], urgente: true }))
      return prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: ot.id, items: { some: { descripcion: nombre } } } })
    }
    const datos = (monto: number) => ({ cotizaciones: ['COT-1'], comprobante: 'FAC-1', motivo: 'Emergencia', monto })
    const c1 = await nuevaCompra('compra 249.999', 249_999)
    await espera('Operador NO compra', S.op, () => marcarCompraDirecta(c1.id, 'x', 1000), /Sin permisos/)
    await exito('Planificador marca compra directa', S.plan, () => marcarCompraDirecta(c1.id, 'Emergencia de faena', 249999))
    await espera('Bajo el límite no se solicita aprobación central (249.999)', S.plan, () => solicitarAprobacionCompra(c1.id, 249_999), /menor a \$250\.000/)
    await exito('Planificador regulariza $249.999 sin aprobación central', S.plan, () => regularizarCompraDirecta(c1.id, datos(249_999)))
    const c2 = await nuevaCompra('compra 250.000', 250_000)
    await exito('Planificador marca la compra de $250.000', S.plan, () => marcarCompraDirecta(c2.id, 'Emergencia de faena', 250000))
    await espera('Regularizar $250.000 exacto exige aprobación central', S.plan, () => regularizarCompraDirecta(c2.id, datos(250_000)), /aprobación central/)
    await espera('Aprobar antes de que la faena lo solicite se rechaza', S.central, () => aprobarCompraDirectaCentral(c2.id), /aún no solicitó/)
    como(S.plan)
    const sol = await Promise.allSettled([solicitarAprobacionCompra(c2.id, 250_000), solicitarAprobacionCompra(c2.id, 250_000)])
    chequear('Solicitar aprobación (doble clic): ambas OK y una sola vez', sol.every(x => x.status === 'fulfilled') && (await auditorias(c2.id, 'SOLICITAR_APROBACION_COMPRA')) === 1)
    await espera('El Planificador NO aprueba', S.plan, () => aprobarCompraDirectaCentral(c2.id), /Sin permisos/)
    await espera('El Jefe de Taller local NO aprueba', S.jefe, () => aprobarCompraDirectaCentral(c2.id), /Sin permisos/)
    await espera('El Planificador Central NO aprueba (exclusivo del Jefe Central)', S.planC, () => aprobarCompraDirectaCentral(c2.id), /Sin permisos/)
    como(S.central)
    const apr = await Promise.allSettled([aprobarCompraDirectaCentral(c2.id), aprobarCompraDirectaCentral(c2.id)])
    chequear('Jefe Central aprueba (doble clic): una sola aprobación', apr.every(x => x.status === 'fulfilled') && (await auditorias(c2.id, 'APROBAR_COMPRA_DIRECTA_CENTRAL')) === 1)
    await exito('Con la aprobación, el Planificador regulariza $250.000', S.plan, () => regularizarCompraDirecta(c2.id, datos(250_000)))
    const c3 = await nuevaCompra('compra 300.000', 300_000)
    await exito('Marca compra 300.000', S.plan, () => marcarCompraDirecta(c3.id, 'Emergencia', 300000))
    await exito('Solicita aprobación por 300.000', S.plan, () => solicitarAprobacionCompra(c3.id, 300_000))
    await exito('Jefe Central aprueba 300.000', S.central, () => aprobarCompraDirectaCentral(c3.id))
    await espera('La aprobación fija el tope: $300.001 se rechaza', S.plan, () => regularizarCompraDirecta(c3.id, datos(300_001)), /supera el monto aprobado/)
    const c4 = await nuevaCompra('compra 400.000', 400_000)
    await exito('Marca la compra estimada en 400.000', S.plan, () => marcarCompraDirecta(c4.id, 'Emergencia', 400000))
    await espera('Un monto informado bajo (1) NO evade el límite: se controla con lo estimado', S.plan, () => regularizarCompraDirecta(c4.id, datos(1)), /aprobación central/)

    // ── B. Ajustes manuales de stock ──────────────────────────────────────────────────────────────────
    await espera('El ajuste directo (movimiento) ya no existe', S.bod, () => registrarMovimiento({ itemId: item.id, tipo: 'AJUSTE', cantidad: 5 }), /se solicitan y los aprueba/)
    await espera('Operador NO solicita ajustes', S.op, () => solicitarAjusteStock({ itemId: item.id, cantidadNueva: 18, motivo: 'inventario' }), /Sin permisos/)
    await espera('El ajuste exige motivo', S.plan, () => solicitarAjusteStock({ itemId: item.id, cantidadNueva: 18, motivo: ' ' }), /motivo/)
    const s0 = await stockLotes()
    const idAj = await exito('Planificador solicita ajustar el stock a 18 (inventario)', S.plan, () => solicitarAjusteStock({ itemId: item.id, cantidadNueva: 18, motivo: 'Inventario físico: faltan 2' }))
    chequear('Solicitar no cambia el stock', (await stockLotes()).stock === s0.stock)
    await espera('Un segundo pedido sobre el mismo ítem se rechaza mientras hay uno pendiente', S.plan, () => solicitarAjusteStock({ itemId: item.id, cantidadNueva: 17, motivo: 'otro' }), /pendiente/)
    await espera('Quien solicita no aprueba su propio ajuste (defensa adicional)', S.central, async () => { await prisma.solicitudAjusteStock.update({ where: { id: idAj as string }, data: { solicitadoPorId: S.central.user.id } }); await aprobarAjusteStock(idAj as string) }, /no puede aprobarlo/)
    await prisma.solicitudAjusteStock.update({ where: { id: idAj as string }, data: { solicitadoPorId: S.plan.user.id } })
    await espera('El Jefe de Taller local NO aprueba ajustes', S.jefe, () => aprobarAjusteStock(idAj as string), /Sin permisos/)
    await espera('El Planificador Central NO aprueba ajustes', S.planC, () => aprobarAjusteStock(idAj as string), /Sin permisos/)
    como(S.central)
    const dobleAj = await Promise.allSettled([aprobarAjusteStock(idAj as string), aprobarAjusteStock(idAj as string)])
    const s1 = await stockLotes()
    chequear('Jefe Central aprueba (doble clic): se aplica una vez, stock 18 = lotes', dobleAj.filter(x => x.status === 'fulfilled').length === 1 && s1.stock === 18 && s1.lotes === 18, JSON.stringify({ r: dobleAj.map(x => x.status), s1 }))
    const idAj2 = await exito('Nuevo pedido de ajuste a 25', S.plan, () => solicitarAjusteStock({ itemId: item.id, cantidadNueva: 25, motivo: 'Conteo con sobrante' }))
    await exito('Jefe Central rechaza con motivo', S.central, () => rechazarAjusteStock(idAj2 as string, 'Recontar'))
    chequear('El rechazo no cambia el stock', (await stockLotes()).stock === 18)
    const idAj3 = await exito('Pedido de ajuste a 22 (sube)', S.plan, () => solicitarAjusteStock({ itemId: item.id, cantidadNueva: 22, motivo: 'Conteo con sobrante' }))
    await exito('Jefe Central aprueba la subida', S.central, () => aprobarAjusteStock(idAj3 as string))
    const s2 = await stockLotes()
    chequear('Tras subir: stock 22 = lotes', s2.stock === 22 && s2.lotes === 22, JSON.stringify(s2))

    // ── C. Inspección crítica, validación técnica y liberación ─────────────────────────────────────────
    await exito('Operador reporta falla de SIM2-EQ-01 con detención', S.op, () => crearReporteFalla({ equipoId: eq1.id, descripcion: 'AUDIT decisiones: falla', riesgoSeguridad: true, detencionSolicitada: true }))
    const rf = await prisma.reporteFalla.findFirstOrThrow({ where: { equipoId: eq1.id, descripcion: { contains: 'AUDIT decisiones' } } })
    await exito('Jefe valida la detención', S.jefe, () => validarDetencion(rf.id, true))
    await espera('Operador NO libera el equipo', S.op, () => liberarEquipo(eq1.id, 'x'), /Sin permisos/)
    await espera('Descartar una detención tampoco lo puede hacer el ADMINISTRADOR', S.adm, () => validarDetencion(rf.id, false, 'x'), /Sin permisos/)
    await espera('El Jefe Central NO libera (es de la faena)', S.central, () => liberarEquipo(eq1.id, 'x'), /Sin permisos/)
    await espera('Jefe de OTRA faena NO libera', S.jefe1, () => liberarEquipo(eq1.id, 'x'), /Sin permisos|otra faena/)
    await espera('Hay una OT en curso: no se libera', S.plan, () => liberarEquipo(eq1.id, 'x'), /OT en reparación/)
    await espera('Descartar la detención con una OT en reparación se rechaza (misma regla)', S.plan, () => validarDetencion(rf.id, false, 'falsa alarma'), /OT en reparación/)
    await espera('Operar con observación con una OT en reparación se rechaza (misma regla)', S.plan, () => autorizarOperarConObservacion(eq1.id, 'sigue operando'), /OT en reparación/)
    await exito('Pasar de detenido a EN_MANTENIMIENTO conserva el episodio abierto (sigue no operacional)', S.jefe, () => actualizarEstadoEquipo(eq1.id, 'EN_MANTENIMIENTO'))
    chequear('El episodio de detención sigue abierto tras el cambio a EN_MANTENIMIENTO', (await prisma.detencionEquipo.count({ where: { equipoId: eq1.id, fin: null } })) === 1)
    await exito('OT: DIAGNOSTICADO', S.jefe, () => cambiarEstadoOT(ot.id, 'DIAGNOSTICADO'))
    await exito('OT: EN_REPARACION', S.jefe, () => cambiarEstadoOT(ot.id, 'EN_REPARACION'))
    await exito('OT: EN_VALIDACION', S.mec, () => cambiarEstadoOT(ot.id, 'EN_VALIDACION'))
    chequear('Al terminar la reparación el equipo SIGUE detenido (no se libera solo)', ['DETENIDO','DETENIDO_PENDIENTE_VALIDACION','EN_MANTENIMIENTO'].includes((await prisma.equipo.findUniqueOrThrow({ where: { id: eq1.id } })).estado))
    await espera('Con reparación, sin validación técnica no se libera', S.plan, () => liberarEquipo(eq1.id), /validación técnica/)
    await espera('Un cambio directo de estado a OPERATIVO también se rechaza', S.jefe, () => actualizarEstadoEquipo(eq1.id, 'OPERATIVO'), /liberación operacional/)
    await espera('El Jefe Central NO valida mientras haya Jefe local', S.central, () => validarTecnicamente(ot.id), /Jefe de Taller local/)
    await prisma.usuario.updateMany({ where: { email: 'jefe2@sim2.local' }, data: { activo: false } })
    await exito('Sin Jefe local, el Jefe Central valida técnicamente', S.central, () => validarTecnicamente(ot.id))
    await prisma.usuario.updateMany({ where: { email: 'jefe2@sim2.local' }, data: { activo: true } })
    await exito('Planificador de la faena libera (reparación validada; sin motivo)', S.plan, () => liberarEquipo(eq1.id))
    chequear('El equipo queda OPERATIVO y la liberación auditada', (await prisma.equipo.findUniqueOrThrow({ where: { id: eq1.id } })).estado === 'OPERATIVO' && (await auditorias(eq1.id, 'LIBERAR')) === 1)
    await exito('Hallazgo sin reparación: detiene SIM2-EQ-02', S.op, () => crearReporteFalla({ equipoId: eq2.id, descripcion: 'AUDIT decisiones: ruido', riesgoSeguridad: true, detencionSolicitada: true }))
    await espera('Sin reparación exige motivo', S.plan, () => liberarEquipo(eq2.id), /motivo/)
    await exito('Con motivo, el Planificador libera', S.plan, () => liberarEquipo(eq2.id, 'Falsa alarma: se revisó en terreno'))
    chequear('SIM2-EQ-02 quedó OPERATIVO', (await prisma.equipo.findUniqueOrThrow({ where: { id: eq2.id } })).estado === 'OPERATIVO')

    // ── D. Estados de Pago: separación, versiones, anulación ───────────────────────────────────────────
    const epDe = (fechaBase: string) => prisma.estadoPago.findMany({ where: { faenaId: faena.id, periodoInicio: { gte: new Date(new Date(fechaBase).getTime() - 40 * 86_400_000), lte: new Date(fechaBase) } }, orderBy: { version: 'asc' } })
    await exito('Planificador Central prepara el Estado de Pago', S.planC, () => prepararEstadoPago(faena.id, '2026-09-19'))
    const ep = (await epDe('2026-09-19')).at(-1)!
    chequear('Queda registrado quién lo preparó', ep.preparadoPorId === S.planC.user.id && ep.version === 1)
    await espera('El Planificador Central NO aprueba', S.planC, () => aprobarEstadoPago(ep.id), /Sin permisos/)
    await espera('El Jefe Central NO aprueba', S.central, () => aprobarEstadoPago(ep.id), /Sin permisos/)
    await exito('Gerencia (de otra faena) aprueba', S.ger, () => aprobarEstadoPago(ep.id))
    await espera('APROBADO es inmutable: ajuste manual', S.planC, async () => agregarAjusteManual((await prisma.estadoPagoLinea.findFirstOrThrow({ where: { estadoPagoId: ep.id } })).id, -1, 'x'), /No se puede ajustar/)
    await espera('APROBADO no se rechaza', S.ger, () => rechazarEstadoPago(ep.id, 'x'), /No se puede rechazar/)
    await espera('APROBADO no se reemplaza sin anularlo', S.planC, () => reemplazarEstadoPago(ep.id), /rechazado o anulado/)
    await espera('El ADMINISTRADOR NO anula', S.adm, () => anularEstadoPago(ep.id, 'x'), /Sin permisos/)
    await espera('El ADMINISTRADOR NO aprueba (Estado de Pago)', S.adm, () => aprobarEstadoPago(ep.id), /Sin permisos/)
    await espera('El ADMINISTRADOR NO aprueba ajustes de stock', S.adm, () => aprobarAjusteStock(idAj as string), /Sin permisos/)
    await espera('El ADMINISTRADOR NO aprueba compras desde $250.000', S.adm, () => aprobarCompraDirectaCentral(c2.id), /Sin permisos/)
    await espera('El ADMINISTRADOR NO libera equipos', S.adm, () => liberarEquipo(eq1.id, 'x'), /Sin permisos/)
    await espera('El Planificador Central NO anula', S.planC, () => anularEstadoPago(ep.id, 'x'), /Sin permisos/)
    await espera('Anular exige motivo', S.ger, () => anularEstadoPago(ep.id, ' '), /motivo/)
    const netoAntes = Number(ep.totalNeto)
    como(S.ger)
    const anul = await Promise.allSettled([anularEstadoPago(ep.id, 'Error de tarifa detectado'), anularEstadoPago(ep.id, 'Error de tarifa detectado')])
    const epA = await prisma.estadoPago.findUniqueOrThrow({ where: { id: ep.id } })
    chequear('Gerencia anula (doble clic): una sola vez, conserva totales y guarda motivo', anul.filter(x => x.status === 'fulfilled').length === 1 && epA.estado === 'ANULADO' && Number(epA.totalNeto) === netoAntes && epA.motivoAnulacion === 'Error de tarifa detectado' && epA.anuladoPorId === S.ger.user.id)
    await espera('ANULADO es terminal: no se aprueba', S.ger, () => aprobarEstadoPago(ep.id), /No se puede aprobar/)
    await espera('Ya hay un documento del periodo: preparar de nuevo obliga a reemplazar', S.planC, () => prepararEstadoPago(faena.id, '2026-09-19'), /reemplazar/)
    como(S.planC)
    const reemp = await Promise.allSettled([reemplazarEstadoPago(ep.id), reemplazarEstadoPago(ep.id)])
    const versiones = await epDe('2026-09-19')
    chequear('Reemplazar (doble clic): una sola versión nueva vinculada, con diferencias y vigente', reemp.filter(x => x.status === 'fulfilled').length === 1 && versiones.length === 2 && versiones[1].version === 2 && versiones[1].versionAnteriorId === ep.id && versiones[1].estado === 'PREPARADO' && versiones[1].diferenciasConAnterior !== null, JSON.stringify(versiones.map(v => [v.version, v.estado])))
    chequear('La versión original se conserva intacta', (await prisma.estadoPago.findUniqueOrThrow({ where: { id: ep.id } })).estado === 'ANULADO')
    const vs = await exito('Se consultan todas las versiones', S.ger, () => getVersionesEstadoPago(ep.id))
    chequear('Se listan 2 versiones', vs?.length === 2)
    await espera('El ADMINISTRADOR NO aprueba Estados de Pago', S.adm, () => aprobarEstadoPago(versiones[1].id), /Sin permisos/)
    await espera('El ADMINISTRADOR NO rechaza Estados de Pago', S.adm, () => rechazarEstadoPago(versiones[1].id, 'x'), /Sin permisos/)
    await espera('El Jefe Central NO prepara Estados de Pago', S.central, () => prepararEstadoPago(faena.id, '2026-08-19'), /Sin permisos/)
    await espera('Separación preparador/aprobador (defensa adicional): Gerencia no decide lo que ella misma preparó', S.ger, async () => { await prisma.estadoPago.update({ where: { id: versiones[1].id }, data: { preparadoPorId: S.ger.user.id } }); await aprobarEstadoPago(versiones[1].id) }, /quien preparó/)
    await prisma.estadoPago.update({ where: { id: versiones[1].id }, data: { preparadoPorId: S.planC.user.id } })
    await exito('Gerencia rechaza la versión 2 con motivo', S.ger, () => rechazarEstadoPago(versiones[1].id, 'Faltan descuentos'))
    await espera('RECHAZADO es inmutable: no se aprueba', S.ger, () => aprobarEstadoPago(versiones[1].id), /No se puede aprobar/)
    await exito('El rechazado se reemplaza (versión 3 vinculada)', S.planC, () => reemplazarEstadoPago(versiones[1].id))
    const v3 = (await epDe('2026-09-19')).at(-1)!
    chequear('Versión 3 vinculada a la 2 y las 3 versiones se conservan', v3.version === 3 && v3.versionAnteriorId === versiones[1].id && (await epDe('2026-09-19')).length === 3)

    // ── E. Pautas versionadas y aprobadas por el Jefe Central ─────────────────────────────────────────
    const items = [{ componente: 'Filtro de aceite', categoria: 'FILTRO' as never, ciclosReemplazar: [250], orden: 1 }]
    const idP1 = await exito('Planificador propone una pauta nueva', S.plan, () => proponerPautaNueva({ nombre: 'AUDIT PM', marcaModelo: 'Marca X', tipoMetrica: 'HRS' as never, ciclosDisponibles: [250, 500], items, motivo: 'Pauta del fabricante' }))
    await espera('Una pauta pendiente no se vincula a un equipo', S.plan, () => vincularPautaEquipo(eq1.id, idP1 as string), /no está aprobada/)
    await espera('El ADMINISTRADOR NO aprueba pautas', S.adm, () => aprobarPauta(idP1 as string), /Sin permisos/)
    await espera('El Planificador NO aprueba pautas', S.plan, () => aprobarPauta(idP1 as string), /Sin permisos/)
    await espera('El Jefe de Taller local NO aprueba pautas', S.jefe, () => aprobarPauta(idP1 as string), /Sin permisos/)
    await exito('El Jefe Central aprueba la pauta', S.central, () => aprobarPauta(idP1 as string))
    await exito('Ahora sí se vincula', S.plan, () => vincularPautaEquipo(eq1.id, idP1 as string))
    await exito('Planificador programa la mantención preventiva con esa pauta', S.plan, () => programarPM({ equipoId: eq1.id, pautaId: idP1 as string, ciclo: 250, fechaPlanificada: '2026-10-01' }))
    const otPM = await prisma.ordenTrabajo.findFirstOrThrow({ where: { equipoId: eq1.id, pautaId: idP1 as string } })
    await espera('Modificar una pauta exige motivo', S.plan, () => proponerVersionPauta(idP1 as string, { motivo: ' ' }), /motivo/)
    const idP2 = await exito('Planificador propone la versión 2 (cambia intervalos)', S.plan, () => proponerVersionPauta(idP1 as string, { motivo: 'Cambia el ciclo a 300 h', ciclosDisponibles: [300, 600] }))
    await espera('No se propone otra versión mientras hay una pendiente', S.plan, () => proponerVersionPauta(idP1 as string, { motivo: 'otra' }), /pendiente/)
    const v1 = await prisma.pautaMantenimiento.findUniqueOrThrow({ where: { id: idP1 as string }, include: { items: true } })
    chequear('La versión anterior NO se sobrescribe mientras la nueva espera aprobación', v1.ciclosDisponibles.join() === '250,500' && v1.activo && v1.items.length === 1)
    await exito('El Jefe Central aprueba la versión 2', S.central, () => aprobarPauta(idP2 as string))
    const v1b = await prisma.pautaMantenimiento.findUniqueOrThrow({ where: { id: idP1 as string } }), v2 = await prisma.pautaMantenimiento.findUniqueOrThrow({ where: { id: idP2 as string } })
    chequear('Versión 2 vigente y versión 1 conservada (inactiva) con sus datos', v2.version === 2 && v2.activo && v2.pautaAnteriorId === idP1 && !v1b.activo && v1b.ciclosDisponibles.join() === '250,500')
    chequear('La OT existente conserva la versión 1 que la originó', (await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otPM.id } })).pautaId === idP1)
    await espera('La versión 1 (inactiva) ya no se vincula', S.plan, () => vincularPautaEquipo(eq1.id, idP1 as string), /no está aprobada|no está vigente/)
    await espera('Jefe de OTRA faena no propone cambios a esta pauta', S.jefe1, () => proponerVersionPauta(idP2 as string, { motivo: 'x' }), /otra faena|Sin permisos/)

    // ── F. Reprogramar exige motivo ────────────────────────────────────────────────────────────────────
    await exito('Planificador crea un plan de mantención', S.plan, () => crearPlan({ equipoId: eq2.id, nombre: 'AUDIT plan', intervaloDias: 30 }))
    const plan = await prisma.planMantenimiento.findFirstOrThrow({ where: { faenaId: faena.id, nombre: 'AUDIT plan' } })
    await exito('Programar por primera vez no exige motivo', S.plan, () => programarParada(plan.id, '2026-10-05'))
    await espera('Reprogramar sin motivo se rechaza', S.plan, () => programarParada(plan.id, '2026-10-08'), /motivo/)
    await exito('Reprogramar con motivo', S.plan, () => programarParada(plan.id, '2026-10-08', 'Equipo en uso esa semana'))
    chequear('La reprogramación queda auditada con su motivo', (await prisma.registroAuditoria.count({ where: { entidadId: plan.id, accion: 'REPROGRAMAR', motivo: 'Equipo en uso esa semana' } })) === 1)
    await espera('Postergar exige motivo', S.plan, () => postergarPlan(plan.id, '2026-10-10', ''), /justificar/)

    // ── G. Turnos ──────────────────────────────────────────────────────────────────────────────────────
    await exito('Jefe crea un operador con 14X14 grupo B (y jornada aparte)', S.jefe, () => crearUsuario({ nombre: 'AUDIT turno', email: 'audit.turno1@sim2.local', password: 'password123', rol: 'OPERADOR', sistemaTurno: '14X14', grupoTurno: 'B' }))
    const ut = await prisma.usuario.findUniqueOrThrow({ where: { email: 'audit.turno1@sim2.local' } })
    chequear('Se guardó el régimen de turnos', ut.sistemaTurno === '14X14' && ut.grupoTurno === 'B')
    await espera('Sistema inválido se rechaza', S.jefe, () => crearUsuario({ nombre: 'x', email: 'audit.turno2@sim2.local', password: 'password123', rol: 'OPERADOR', sistemaTurno: '5X2', grupoTurno: 'A' }), /inválido/)
    await espera('Sistema sin grupo se rechaza', S.jefe, () => crearUsuario({ nombre: 'x', email: 'audit.turno3@sim2.local', password: 'password123', rol: 'OPERADOR', sistemaTurno: '7X7' }), /juntos/)
    await exito('Se cambia a 7X7 grupo A', S.jefe, () => actualizarUsuario(ut.id, { nombre: ut.nombre, email: ut.email, rol: ut.rol, sistemaTurno: '7X7', grupoTurno: 'A' }))
    chequear('El cambio se guardó', (await prisma.usuario.findUniqueOrThrow({ where: { id: ut.id } })).sistemaTurno === '7X7')
    chequear('Los usuarios anteriores (sin turno) siguen intactos (retrocompatible)', (await prisma.usuario.findUniqueOrThrow({ where: { email: 'jefe2@sim2.local' } })).sistemaTurno === null)

    // ── H. Alertas y escalamiento contra la base ───────────────────────────────────────────────────────
    await exito('Jefe crea una OT CRÍTICA sin responsable', S.jefe, () => crearOT({ equipoId: eq2.id, descripcionFalla: 'AUDIT alerta crítica', prioridad: 'CRITICA' }))
    const otCrit = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: faena.id, descripcionFalla: 'AUDIT alerta crítica' } })
    const noti = (nivel: number) => prisma.notificacion.count({ where: { entidadId: otCrit.id, tipo: 'ot_critica_sin_responsable', nivel } })
    const ahora = new Date()
    await procesarAlertas(prisma, new Date(ahora.getTime() + 60_000))
    chequear('Inmediata al Planificador de la faena', (await noti(0)) === 1 && (await noti(1)) === 0)
    const r2 = await procesarAlertas(prisma, new Date(ahora.getTime() + 120_000))
    chequear('Ejecutar de nuevo no duplica (idempotente)', (await noti(0)) === 1 && r2.nuevas >= 0)
    await Promise.all([procesarAlertas(prisma, new Date(ahora.getTime() + 31 * 60_000)), procesarAlertas(prisma, new Date(ahora.getTime() + 31 * 60_000))])
    chequear('A los 30 min escala al Jefe Central, una sola vez aun con ejecuciones simultáneas', (await noti(1)) === 1 && (await prisma.notificacion.findFirstOrThrow({ where: { entidadId: otCrit.id, nivel: 1 } })).rolDestino === 'JEFE_TALLER_CENTRAL')
    const verPlan = await exito('El Planificador de la faena ve sus alertas', S.plan, () => getAlertasInternas())
    chequear('El Planificador ve la alerta de su nivel y NO la del Jefe Central', !!verPlan?.some(n => n.entidadId === otCrit.id && n.nivel === 0) && !verPlan?.some(n => n.entidadId === otCrit.id && n.nivel === 1))
    const verCentral = await exito('El Jefe Central ve las de todas las faenas', S.central, () => getAlertasInternas())
    chequear('El Jefe Central ve el escalamiento de la faena', !!verCentral?.some(n => n.entidadId === otCrit.id && n.nivel === 1))
    const verOp = await exito('El Operador no recibe alertas de gestión', S.op, () => getAlertasInternas())
    chequear('Operador sin alertas', (verOp?.length ?? 0) === 0)
    const verPlan1 = await exito('Planificador de OTRA faena', S.plan1, () => getAlertasInternas())
    chequear('No ve las alertas de SIM-02 (aislamiento)', !verPlan1?.some(n => n.entidadId === otCrit.id))

    // ── J. Correcciones de la revisión: separación en compras, tope, solicitud pendiente, ajuste vencido, concurrencia ──
    const c5 = await nuevaCompra('compra 260.000 (autoaprobación)', 260_000)
    await exito('El Jefe Central marca la compra', S.central, () => marcarCompraDirecta(c5.id, 'Emergencia', 260000))
    await exito('El Jefe Central solicita la aprobación', S.central, () => solicitarAprobacionCompra(c5.id, 260_000))
    await espera('Quien solicita la aprobación de una compra no la aprueba', S.central, () => aprobarCompraDirectaCentral(c5.id), /no puede aprobarla/)
    const c6 = await nuevaCompra('compra estimada 500.000', 500_000)
    await exito('Marca la compra estimada en 500.000', S.plan, () => marcarCompraDirecta(c6.id, 'Emergencia', 500000))
    await exito('Solicita la aprobación declarando solo 250.000', S.plan, () => solicitarAprobacionCompra(c6.id, 250_000))
    chequear('El tope solicitado no queda bajo lo estimado (500.000)', Number((await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: c6.id } })).montoSolicitado) === 500_000)
    await espera('Con la solicitud pendiente no se regulariza', S.plan, () => regularizarCompraDirecta(c6.id, datos(250_000)), /solicitud de aprobación central pendiente/)

    await exito('Ajuste: el Planificador solicita 30', S.plan, async () => { await solicitarAjusteStock({ itemId: item.id, cantidadNueva: 30, motivo: 'Conteo del lunes' }) })
    const idViejo = (await prisma.solicitudAjusteStock.findFirstOrThrow({ where: { itemId: item.id, estado: 'PENDIENTE' } })).id
    await exito('Entra stock mientras el ajuste espera', S.bod, () => registrarMovimiento({ itemId: item.id, tipo: 'ENTRADA', cantidad: 3, costoUnitario: 10000 }))
    await espera('Aprobar un ajuste con el stock ya cambiado se rechaza', S.central, () => aprobarAjusteStock(idViejo), /stock cambió/)
    await exito('Se rechaza la solicitud vencida', S.central, () => rechazarAjusteStock(idViejo, 'Stock cambió: recontar'))
    como(S.plan)
    const dosAj = await Promise.allSettled([solicitarAjusteStock({ itemId: item.id, cantidadNueva: 26, motivo: 'Recuento' }), solicitarAjusteStock({ itemId: item.id, cantidadNueva: 26, motivo: 'Recuento' })])
    chequear('Doble solicitud simultánea de ajuste: queda una sola pendiente', (await prisma.solicitudAjusteStock.count({ where: { itemId: item.id, estado: 'PENDIENTE' } })) === 1, JSON.stringify(dosAj.map(x => x.status === 'rejected' ? String((x.reason as Error)?.message).replace(/\s+/g, ' ').slice(0, 120) : x.status)))
    const pend = await prisma.solicitudAjusteStock.findFirstOrThrow({ where: { itemId: item.id, estado: 'PENDIENTE' } })
    await exito('Se rechaza para dejar el ítem libre', S.central, () => rechazarAjusteStock(pend.id, 'Prueba'))
    como(S.bod)
    const antes = await stockLotes()
    const sim = await Promise.allSettled([registrarMovimiento({ itemId: item.id, tipo: 'SALIDA', cantidad: 2 }), registrarMovimiento({ itemId: item.id, tipo: 'SALIDA', cantidad: 2 }), registrarMovimiento({ itemId: item.id, tipo: 'SALIDA', cantidad: 2 })])
    const desp = await stockLotes()
    chequear('Tres salidas simultáneas que caben: se descuentan las tres y stock = lotes (sin pérdida de actualización)', sim.every(x => x.status === 'fulfilled') && desp.stock === antes.stock - 6 && desp.lotes === desp.stock, JSON.stringify({ r: sim.map(x => x.status), antes, desp }))

    // ── K0. Monto obligatorio, rechazo de la solicitud, corrección/reenvío y cancelación ───────────────────────
    const cR = await nuevaCompra('compra rechazable', 320_000)
    await espera('La compra directa exige monto estimado mayor a cero', S.plan, () => marcarCompraDirecta(cR.id, 'Emergencia', 0), /monto estimado/)
    await exito('Marca la compra con monto estimado', S.plan, () => marcarCompraDirecta(cR.id, 'Emergencia', 320_000))
    await exito('Solicita la aprobación central', S.plan, () => solicitarAprobacionCompra(cR.id, 320_000))
    await espera('El Planificador NO rechaza la solicitud', S.plan, () => rechazarAprobacionCompra(cR.id, 'no'), /Sin permisos/)
    await espera('El ADMINISTRADOR NO rechaza la solicitud', S.adm, () => rechazarAprobacionCompra(cR.id, 'no'), /Sin permisos/)
    await espera('El rechazo exige motivo', S.central, () => rechazarAprobacionCompra(cR.id, ' '), /motivo/)
    const stockAntesR = (await stockLotes()).stock
    await exito('El Jefe Central rechaza con motivo', S.central, () => rechazarAprobacionCompra(cR.id, 'El monto no corresponde al presupuesto'))
    const rr = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: cR.id } })
    chequear('Tras el rechazo: sin solicitud vigente, motivo visible, no aprobada y auditada', !rr.aprobacionSolicitadaAt && rr.motivoRechazoAprobacion === 'El monto no corresponde al presupuesto' && !rr.aprobadaCentralPorId && (await auditorias(cR.id, 'RECHAZAR_APROBACION_COMPRA')) === 1)
    await espera('El rechazo NO autoriza regularizar (sigue exigiendo aprobación)', S.plan, () => regularizarCompraDirecta(cR.id, datos(320_000)), /aprobación central/)
    chequear('El rechazo no descuenta stock', (await stockLotes()).stock === stockAntesR)
    await espera('No se puede rechazar dos veces', S.central, () => rechazarAprobacionCompra(cR.id, 'otra vez'), /No hay una solicitud/)
    await exito('El Planificador corrige el monto y reenvía la solicitud', S.plan, () => solicitarAprobacionCompra(cR.id, 300_000))
    chequear('El reenvío limpia el motivo anterior y queda pendiente', !!(await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: cR.id } })).aprobacionSolicitadaAt)
    await exito('El Jefe Central rechaza de nuevo', S.central, () => rechazarAprobacionCompra(cR.id, 'Faltan cotizaciones'))
    await espera('Operador NO cancela la compra', S.op, () => cancelarCompraDirecta(cR.id, 'x'), /Sin permisos/)
    await exito('El Planificador cancela la compra', S.plan, () => cancelarCompraDirecta(cR.id, 'Se resolvió con stock'))
    const cc = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: cR.id } })
    chequear('Cancelada: vuelve a solicitud normal, sin stock movido y auditada', !cc.esCompraDirecta && !cc.aprobacionSolicitadaAt && (await stockLotes()).stock === stockAntesR && (await auditorias(cR.id, 'CANCELAR_COMPRA_DIRECTA')) === 1)
    await espera('Una compra cancelada ya no se regulariza', S.plan, () => regularizarCompraDirecta(cR.id, datos(100_000)), /no es una compra directa/)
    await espera('El monto real al regularizar debe ser mayor a cero', S.plan, () => regularizarCompraDirecta(c4.id, datos(0)), /mayor a cero/)

    // ── K1. Detención SIN OT: el episodio empieza al detener el equipo y termina solo con la liberación ────────────
    const eqD = await prisma.equipo.create({ data: { faenaId: faena.id, codigo: 'SIM2-EQ-D', nombre: 'Equipo detención', tipo: 'MAQUINARIA', costoHoraDetencion: 1000 } })
    await exito('El operador reporta una falla con detención (todavía sin OT)', S.op, () => crearReporteFalla({ equipoId: eqD.id, descripcion: 'AUDIT detención sin OT', riesgoSeguridad: true, detencionSolicitada: true }))
    const det0 = await prisma.detencionEquipo.findMany({ where: { equipoId: eqD.id } })
    chequear('Se abre el episodio de detención al reportar (sin OT), con su hora inicial', det0.length === 1 && det0[0].fin === null && det0[0].otId === null && det0[0].origen === 'REPORTE_FALLA')
    await new Promise(r => setTimeout(r, 1500))
    const repD = await prisma.reporteFalla.findFirstOrThrow({ where: { equipoId: eqD.id } })
    await exito('Jefe valida la detención', S.jefe, () => validarDetencion(repD.id, true))
    await exito('Más tarde se convierte en OT', S.plan, () => convertirReporteEnOT(repD.id))
    const det1 = await prisma.detencionEquipo.findMany({ where: { equipoId: eqD.id } })
    chequear('La OT se vincula al mismo episodio SIN cambiar la hora inicial', det1.length === 1 && det1[0].otId !== null && det1[0].inicio.getTime() === det0[0].inicio.getTime(), JSON.stringify(det1))
    await espera('Con la OT en curso no se libera', S.plan, () => liberarEquipo(eqD.id, 'x'), /OT en reparación/)
    await prisma.ordenTrabajo.update({ where: { id: det1[0].otId as string }, data: { estado: 'ANULADA' } })
    await exito('Sin OT en curso, el Planificador libera con motivo', S.plan, () => liberarEquipo(eqD.id, 'Revisado en terreno'))
    const det2 = await prisma.detencionEquipo.findMany({ where: { equipoId: eqD.id } })
    chequear('La liberación cierra el episodio (única forma de terminarlo)', det2.length === 1 && det2[0].fin !== null && det2[0].fin.getTime() > det2[0].inicio.getTime())

    // ── K0b. Corrección del monto estimado tras un rechazo (hacia abajo y hacia arriba) ────────────────────────────
    const otCorr = await prisma.ordenTrabajo.create({ data: { faenaId: faena.id, equipoId: eq1.id, tipoMantenimiento: 'CORRECTIVO', estado: 'ABIERTA', prioridad: 'MEDIA', descripcionFalla: 'AUDIT corrección monto', creadoPorId: S.jefe.user.id } })
    await exito('SR sin precios para la prueba de corrección', S.jefe, () => crearSR(otCorr.id, { items: [{ descripcion: 'corregible', cantidad: 1, unidad: 'un' }], urgente: true }))
    const cCor = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: otCorr.id } })
    const tope = async () => Number((await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: cCor.id } })).montoSolicitado)
    const estimado = async () => Number((await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: cCor.id } })).montoEstimadoCompra)
    await exito('Marca con estimado $300.000', S.plan, () => marcarCompraDirecta(cCor.id, 'Emergencia', 300_000))
    await exito('Solicita aprobación por $300.000', S.plan, () => solicitarAprobacionCompra(cCor.id, 300_000, 300_000))
    chequear('El tope inicial es exactamente $300.000', (await tope()) === 300_000, String(await tope()))
    await espera('No se corrige el monto con una solicitud vigente', S.plan, () => solicitarAprobacionCompra(cCor.id, 260_000, 260_000), /decisión|idempot|Ya hay/)
    await exito('Rechazo', S.central, () => rechazarAprobacionCompra(cCor.id, 'Monto excesivo'))
    await exito('Corrige HACIA ABAJO a $260.000 y reenvía', S.plan, () => solicitarAprobacionCompra(cCor.id, 260_000, 260_000))
    chequear('Tras corregir hacia abajo: estimado y tope EXACTOS en $260.000 (no queda el mayor anterior)', (await tope()) === 260_000 && (await estimado()) === 260_000, JSON.stringify({ tope: await tope(), estimado: await estimado() }))
    await exito('Rechazo 2', S.central, () => rechazarAprobacionCompra(cCor.id, 'Faltan antecedentes'))
    await exito('Corrige HACIA ARRIBA a $400.000 y reenvía', S.plan, () => solicitarAprobacionCompra(cCor.id, 400_000, 400_000))
    chequear('Tras corregir hacia arriba: estimado y tope EXACTOS en $400.000', (await tope()) === 400_000 && (await estimado()) === 400_000, JSON.stringify({ tope: await tope(), estimado: await estimado() }))
    chequear('Cada corrección del monto queda auditada (anterior y nuevo)', (await prisma.registroAuditoria.count({ where: { entidadId: cCor.id, accion: 'CORREGIR_MONTO_ESTIMADO' } })) === 2)

    // ── K. Fraccionamiento de compras, faena sin responsable, cron ────────────────────────────────────────────
    await exito('Jefe crea otra OT para la prueba de fraccionamiento', S.jefe, () => crearOT({ equipoId: eq2.id, descripcionFalla: 'AUDIT fraccionamiento' }))
    const otF = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: faena.id, descripcionFalla: 'AUDIT fraccionamiento' } })
    const srF = async (nombre: string) => { await exito(`SR ${nombre}`, S.jefe, () => crearSR(otF.id, { items: [{ descripcion: nombre, cantidad: 1, unidad: 'un' }], urgente: true })); return prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: otF.id, items: { some: { descripcion: nombre } } } }) }
    const fA = await srF('frac A'), fB = await srF('frac B'), fC = await srF('frac C')
    await prisma.solicitudRepuesto.update({ where: { id: fC.id }, data: { createdAt: new Date(Date.now() - 3 * 86_400_000) } }) // C es de otro día: compra independiente
    await exito('Marca C (independiente)', S.plan, () => marcarCompraDirecta(fC.id, 'Emergencia', 100000))
    await exito('Marca A', S.plan, () => marcarCompraDirecta(fA.id, 'Emergencia', 100000))
    await exito('Marca B', S.plan, () => marcarCompraDirecta(fB.id, 'Emergencia', 100000))
    chequear('Las compras de la misma OT en 24 h quedan auditadas como misma necesidad', (await auditorias(fB.id, 'COMPRAS_MISMA_NECESIDAD')) === 1)
    await exito('Regulariza A por $100.000 (bajo el límite, con B estimada en $100.000)', S.plan, () => regularizarCompraDirecta(fA.id, datos(100_000)))
    await espera('Regularizar B por $150.000 se bloquea: junto con A alcanza $250.000 (misma OT, 24 h)', S.plan, () => regularizarCompraDirecta(fB.id, datos(150_000)), /misma OT en 24 h/)
    await exito('Se puede solicitar la aprobación central de B por el acumulado', S.plan, () => solicitarAprobacionCompra(fB.id, 150_000))
    await exito('El Jefe Central aprueba la compra fraccionada', S.central, () => aprobarCompraDirectaCentral(fB.id))
    await exito('Con la aprobación, B se regulariza', S.plan, () => regularizarCompraDirecta(fB.id, datos(150_000)))
        // concurrencia: dos compras nuevas de otra OT, sin precio estimado, que juntas alcanzan el límite
    const otG = await prisma.ordenTrabajo.create({ data: { faenaId: faena.id, equipoId: eq1.id, tipoMantenimiento: 'CORRECTIVO', estado: 'ABIERTA', prioridad: 'MEDIA', descripcionFalla: 'AUDIT frac concurrencia', creadoPorId: S.jefe.user.id } })
    const srG = async (n: string) => { await exito(`SR ${n}`, S.jefe, () => crearSR(otG.id, { items: [{ descripcion: n, cantidad: 1, unidad: 'un' }], urgente: true })); const x = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: otG.id, items: { some: { descripcion: n } } } }); await exito(`Marca ${n}`, S.plan, () => marcarCompraDirecta(x.id, 'Emergencia', 100000)); return x }
    const g1 = await srG('conc 1'), g2 = await srG('conc 2')
    como(S.plan)
    const conc = await Promise.allSettled([regularizarCompraDirecta(g1.id, datos(130_000)), regularizarCompraDirecta(g2.id, datos(130_000))])
    const reg1 = await prisma.solicitudRepuesto.count({ where: { otId: otG.id, regularizada: true } })
    chequear('Dos regularizaciones simultáneas de la misma necesidad ($260.000 en total): solo una pasa sin aprobación', conc.filter(x => x.status === 'fulfilled').length === 1 && reg1 === 1, JSON.stringify({ r: conc.map(x => x.status), reg1 }))
    const otH = await prisma.ordenTrabajo.create({ data: { faenaId: faena.id, equipoId: eq1.id, tipoMantenimiento: 'CORRECTIVO', estado: 'ABIERTA', prioridad: 'MEDIA', descripcionFalla: 'AUDIT independiente', creadoPorId: S.jefe.user.id } })
    await exito('SR de otra OT (compra independiente)', S.jefe, () => crearSR(otH.id, { items: [{ descripcion: 'independiente', cantidad: 1, unidad: 'un' }], urgente: true }))
    const srI = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: otH.id } })
    await exito('Marca la compra independiente', S.plan, () => marcarCompraDirecta(srI.id, 'Emergencia', 200000))
    await exito('Una compra independiente (otra OT) de $200.000 NO se bloquea', S.plan, () => regularizarCompraDirecta(srI.id, datos(200_000)))
    await exito('Fuera de las 24 h ya no es la misma necesidad: C por $100.000 se regulariza', S.plan, () => regularizarCompraDirecta(fC.id, datos(100_000)))

    // transferencias entre faenas: stock = lotes y sin deadlock con transferencias opuestas
    const itemOtra = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: sim1.id } })
    const lotesDe = async (id: string) => { const it = await prisma.itemBodega.findUniqueOrThrow({ where: { id } }); return { stock: Number(it.stockActual), lotes: (await prisma.loteBodega.findMany({ where: { itemId: id } })).reduce((a, l) => a + Number(l.cantidadSaldo), 0) } }
    const t0a = await lotesDe(item.id), t0b = await lotesDe(itemOtra.id)
    como(S.central)
    const tr = await Promise.allSettled([transferirStockEntreFaenas({ itemOrigenId: item.id, itemDestinoId: itemOtra.id, cantidad: 1 }), transferirStockEntreFaenas({ itemOrigenId: itemOtra.id, itemDestinoId: item.id, cantidad: 1 })])
    const t1a = await lotesDe(item.id), t1b = await lotesDe(itemOtra.id)
    chequear('Transferencias opuestas simultáneas: ambas OK, sin deadlock, stock = lotes en las dos faenas y sin pérdida', tr.every(x => x.status === 'fulfilled') && t1a.stock === t1a.lotes && t1b.stock === t1b.lotes && t1a.stock === t0a.stock && t1b.stock === t0b.stock, JSON.stringify({ r: tr.map(x => x.status === 'rejected' ? String((x.reason as Error).message).slice(0, 80) : 'ok'), t0a, t1a, t0b, t1b }))

    // faena sin Jefe ni Planificador: el equipo sigue detenido y se avisa al nivel central
    await prisma.equipo.update({ where: { id: eq2.id }, data: { estado: 'DETENIDO' } })
    await prisma.usuario.updateMany({ where: { faenaId: faena.id, rol: { in: ['JEFE_TALLER', 'PLANIFICADOR'] } }, data: { activo: false } })
    await procesarAlertas(prisma, new Date())
    const sinResp = await prisma.notificacion.findMany({ where: { tipo: 'faena_sin_responsable', entidadId: faena.id } })
    chequear('Faena sin Jefe ni Planificador: aviso inmediato al Jefe Central y al Planificador Central', sinResp.map(n => n.rolDestino).sort().join() === 'JEFE_TALLER_CENTRAL,PLANIFICADOR_CENTRAL', JSON.stringify(sinResp.map(n => n.rolDestino)))
    await espera('El ADMINISTRADOR no puede liberar el equipo de una faena sin responsable', S.adm, () => liberarEquipo(eq2.id, 'x'), /Sin permisos/)
    await espera('Ni el Jefe Central', S.central, () => liberarEquipo(eq2.id, 'x'), /Sin permisos/)
    chequear('El equipo permanece detenido', (await prisma.equipo.findUniqueOrThrow({ where: { id: eq2.id } })).estado === 'DETENIDO')
    await prisma.usuario.updateMany({ where: { faenaId: faena.id, rol: { in: ['JEFE_TALLER', 'PLANIFICADOR'] } }, data: { activo: true } })
    await prisma.equipo.update({ where: { id: eq2.id }, data: { estado: 'OPERATIVO' } })

    // cron: el endpoint protegido y la ejecución repetida no duplica
    const { POST } = await import('../src/app/api/alertas/procesar/route')
    const secretoAnterior = process.env.ALERTAS_CRON_SECRET
    delete process.env.ALERTAS_CRON_SECRET
    chequear('Sin secreto configurado el endpoint está apagado (503)', (await POST(new Request('http://x/api/alertas/procesar', { method: 'POST' }))).status === 503)
    process.env.ALERTAS_CRON_SECRET = 'prueba-secreto-'.padEnd(40, 'x')
    chequear('Sin credencial: 401', (await POST(new Request('http://x/api/alertas/procesar', { method: 'POST' }))).status === 401)
    chequear('Credencial incorrecta: 401', (await POST(new Request('http://x/api/alertas/procesar', { method: 'POST', headers: { authorization: 'Bearer incorrecto' } }))).status === 401)
    const llamar = async () => (await (await POST(new Request('http://x/api/alertas/procesar', { method: 'POST', headers: { authorization: `Bearer ${process.env.ALERTAS_CRON_SECRET}` } }))).json()) as { generadas: number; nuevas: number }
    await llamar()
    const total1 = await prisma.notificacion.count()
    const rr2 = await llamar(); const total2 = await prisma.notificacion.count()
    const [c1x, c2x] = await Promise.all([llamar(), llamar()])
    chequear('Ejecuciones repetidas y simultáneas del cron no duplican alertas', rr2.nuevas === 0 && c1x.nuevas + c2x.nuevas === 0 && total2 === total1 && (await prisma.notificacion.count()) === total1, JSON.stringify({ total1, total2, rr2 }))
    if (secretoAnterior) process.env.ALERTAS_CRON_SECRET = secretoAnterior; else delete process.env.ALERTAS_CRON_SECRET

    // ── I. Aislamiento entre faenas ────────────────────────────────────────────────────────────────────
    await espera('Planificador de OTRA faena no solicita ajustes de este ítem', S.plan1, () => solicitarAjusteStock({ itemId: item.id, cantidadNueva: 1, motivo: 'x' }), /otra faena|Sin permisos/)
    await espera('Planificador de OTRA faena no pide aprobación de compra ajena', S.plan1, () => solicitarAprobacionCompra(c1.id, 300_000), /otra faena|Sin permisos/)
    await espera('Jefe de OTRA faena no rechaza ajustes ajenos', S.jefe1, () => rechazarAjusteStock(idAj3 as string, 'x'), /Sin permisos/)

    const fallos = pasos.filter(p => !p.ok)
    expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([])
  }, 400_000)
})
