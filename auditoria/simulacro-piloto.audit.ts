// Simulacro del piloto: carga la faena ficticia PIL-01 con el MISMO importador que se usará en
// producción y opera con los cinco roles. Solo erp_minera_dev. Falla si algo no se cumple.
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { compare } from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { ejecutarCarga } from '../src/lib/importador/ejecutar'
import { fraseConfirmacion } from '../src/lib/importador/guardia'
import { nombreBaseDesdeUrl } from '../src/lib/db-guard'
import { borrarFaenaSimulada } from '../scripts/auditoria/borrar-faena'
import { ejecutarMonitoreo } from '../src/lib/monitoreo'
import { crearReporteFalla, validarDetencion, convertirReporteEnOT } from '../src/actions/fallas'
import { agregarBitacora, asignarTecnico, cambiarEstadoOT, crearOT, validarTecnicamente } from '../src/actions/ot'
import { autorizarSolicitud, entregarSolicitud, solicitarRepuesto } from '../src/actions/repuestos'
import { crearItem } from '../src/actions/bodega'
import { liberarEquipo } from '../src/actions/equipos'
import { registrarHorometro, confirmarLecturaHorometro, getLecturasPendientes } from '../src/actions/horometro'
import { crearPlantilla, crearInspeccion, generarOTDesdeAlerta } from '../src/actions/inspeccion'
import { crearSR, cambiarEstadoSR } from '../src/actions/sr'
import { crearUsuario } from '../src/actions/usuarios'
import { prepararEstadoPago, aprobarEstadoPago } from '../src/actions/estadoPago'

type Paso = { paso: string; ok: boolean; detalle: string }
const pasos: Paso[] = []
const EJEMPLO = path.join(__dirname, '..', 'plantillas-carga', 'ejemplo-piloto')
const SALIDA_IMP = path.join(__dirname, '..', 'scripts', 'salida')
const BASE = nombreBaseDesdeUrl(process.env.DATABASE_URL)

/** Copia la planilla de ejemplo cambiando faena y correos (para probar otras cargas sin chocar con PIL-01). */
function copiarPlanillas(destino: string, faena: string, transformar?: (archivo: string, texto: string) => string) {
  fs.mkdirSync(destino, { recursive: true })
  for (const f of fs.readdirSync(EJEMPLO)) {
    let t = fs.readFileSync(path.join(EJEMPLO, f), 'utf8').replace(/PIL-01/g, faena).replace(/@piloto\.local/g, faena === 'PIL-01' ? '@piloto.local' : `@${faena.toLowerCase().replace('-', '')}.local`)
    if (transformar) t = transformar(f, t)
    fs.writeFileSync(path.join(destino, f), t)
  }
}

describe('simulacro del piloto (PIL-01)', () => {
  afterAll(() => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'simulacro-piloto.json'), JSON.stringify(pasos, null, 2)) })
  it('importa y opera', async () => {
    const chequear = (paso: string, ok: boolean, detalle = 'ok') => pasos.push({ paso, ok, detalle: ok ? 'ok' : detalle })
    const espera = async (paso: string, s: unknown, fn: () => Promise<unknown>, patron: RegExp) => {
      como(s)
      try { await fn(); chequear(paso, false, 'debía ser rechazado y fue permitido') }
      catch (e) { const m = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' '); chequear(paso, patron.test(m), `mensaje inesperado: ${m.slice(0, 140)}`) }
    }
    const exito = async <T,>(paso: string, s: unknown, fn: () => Promise<T>): Promise<T | undefined> => {
      como(s)
      try { const r = await fn(); chequear(paso, true); return r } catch (e) { chequear(paso, false, (e instanceof Error ? e.message : String(e)).slice(0, 180)); return undefined }
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'))
    for (const f of ['PIL-01', 'PIL-02', 'PIL-03']) await borrarFaenaSimulada(f)
    for (const f of ['credenciales-PIL-01.csv']) fs.rmSync(path.join(SALIDA_IMP, f), { force: true })
    const carga = (o: { dir?: string; faena?: string; apply?: boolean; base?: string; confirmo?: string; simularFalla?: boolean }) =>
      ejecutarCarga(prisma, { dir: o.dir ?? EJEMPLO, faena: o.faena ?? 'PIL-01', baseActual: BASE, apply: !!o.apply, base: o.base, confirmo: o.confirmo, simularFalla: o.simularFalla, carpetaSalida: SALIDA_IMP })
    const confirmar = (f = 'PIL-01') => ({ apply: true, base: BASE, confirmo: fraseConfirmacion(f, BASE) })
    const contar = async (f: string) => {
      const fa = await prisma.faena.findUnique({ where: { codigo: f } })
      if (!fa) return null
      const [usuarios, tecnicos, equipos, asignaciones, items, lotes] = await Promise.all([
        prisma.usuario.count({ where: { faenaId: fa.id } }), prisma.tecnico.count({ where: { faenaId: fa.id } }), prisma.equipo.count({ where: { faenaId: fa.id } }),
        prisma.asignacionEquipoFaena.count({ where: { faenaId: fa.id } }), prisma.itemBodega.count({ where: { faenaId: fa.id } }), prisma.loteBodega.count({ where: { item: { faenaId: fa.id } } }),
      ])
      return { usuarios, tecnicos, equipos, asignaciones, items, lotes }
    }

    // ── 1. Importador: dry-run, confirmaciones, carga, idempotencia, rollback ─────────────
    const dry = await carga({})
    chequear('Dry-run: informe sin errores y no escribe nada', dry.informe.errores.length === 0 && !dry.aplicado && (await contar('PIL-01')) === null, JSON.stringify(dry.informe.errores.slice(0, 2)))
    chequear('Dry-run informa lo que va a crear', dry.informe.nuevos.usuarios === 9 && dry.informe.nuevos.items_bodega === 12 && dry.informe.nuevos.lotes === 14 && dry.informe.nuevos.asignaciones === 5)
    const sinConfirmar = await carga({ apply: true })
    chequear('Apply sin base ni frase de confirmación se rechaza y no escribe', !!sinConfirmar.rechazo && (await contar('PIL-01')) === null, String(sinConfirmar.rechazo))
    const baseMala = await carga({ apply: true, base: 'erp_minera', confirmo: fraseConfirmacion('PIL-01', 'erp_minera') })
    chequear('Apply con la base equivocada se rechaza', !!baseMala.rechazo && (await contar('PIL-01')) === null, String(baseMala.rechazo))
    const conflictoDir = path.join(tmp, 'conflicto'); copiarPlanillas(conflictoDir, 'PIL-01', (f, t) => f === 'lotes.csv' ? t.replace('PIL-01,FIL-ACE-01,FAC-1001,8', 'PIL-01,FIL-ACE-01,FAC-1001,9') : t)
    const sinLotes = await carga({ dir: conflictoDir, ...confirmar() })
    chequear('Apply con stock ≠ suma de lotes se rechaza (validación previa) y no escribe', !!sinLotes.rechazo && sinLotes.informe.errores.some(e => /no coincide con la suma/.test(e.mensaje)) && (await contar('PIL-01')) === null, JSON.stringify(sinLotes.informe.errores.slice(0, 2)))

    const real = await carga(confirmar())
    chequear('Apply: carga aplicada', real.aplicado, String(real.rechazo))
    const c1 = await contar('PIL-01')
    chequear('Se crearon 9 usuarios, 2 técnicos, 6 equipos, 5 asignaciones, 12 ítems y 14 lotes', JSON.stringify(c1) === JSON.stringify({ usuarios: 9, tecnicos: 2, equipos: 6, asignaciones: 5, items: 12, lotes: 14 }), JSON.stringify(c1))
    chequear('Se generaron contraseñas temporales (9) en un archivo fuera de git', real.resultado?.credenciales.length === 9 && !!real.archivoCredenciales && fs.existsSync(real.archivoCredenciales))
    const jefeCred = real.resultado?.credenciales.find(c => c.email === 'jefe@piloto.local')
    const jefeBd = await prisma.usuario.findUniqueOrThrow({ where: { email: 'jefe@piloto.local' } })
    chequear('La contraseña temporal entrega acceso (hash correcto) y no se guardó en texto plano', !!jefeCred && (await compare(jefeCred.passwordTemporal, jefeBd.password)) && jefeBd.password !== jefeCred.passwordTemporal)
    const faenaPil = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'PIL-01' } })
    const invariantes = async () => {
      const its = await prisma.itemBodega.findMany({ where: { faenaId: faenaPil.id }, include: { lotes: true, movimientos: { include: { consumos: true } } } })
      const malos: string[] = []
      for (const it of its) {
        const stock = Number(it.stockActual), saldo = it.lotes.reduce((a, l) => a + Number(l.cantidadSaldo), 0)
        const ent = it.movimientos.filter(m => m.tipo === 'ENTRADA').reduce((a, m) => a + Number(m.cantidad), 0), sal = it.movimientos.filter(m => m.tipo === 'SALIDA').reduce((a, m) => a + Number(m.cantidad), 0)
        const aj = it.movimientos.filter(m => m.tipo === 'AJUSTE')
        if (Math.abs(stock - saldo) > 0.005) malos.push(`${it.codigo}: stock ${stock} ≠ lotes ${saldo}`)
        if (stock < 0 || it.lotes.some(l => Number(l.cantidadSaldo) < 0)) malos.push(`${it.codigo}: negativo`)
        if (!aj.length && Math.abs(ent - sal - stock) > 0.005) malos.push(`${it.codigo}: entradas ${ent} - salidas ${sal} ≠ stock ${stock}`)
        for (const m of it.movimientos.filter(m => m.tipo === 'SALIDA')) if (Math.abs(m.consumos.reduce((a, c) => a + Number(c.cantidad), 0) - Number(m.cantidad)) > 0.005) malos.push(`${it.codigo}: consumos FIFO de una salida no suman su cantidad`)
      }
      return malos
    }
    chequear('Tras la carga: stock = suma de lotes = entradas para los 12 ítems', (await invariantes()).length === 0, (await invariantes()).join('; '))
    const stockCero = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: faenaPil.id, codigo: 'BUJ-CAL-01' } })
    chequear('El ítem sin stock inicial se carga con 0 y sin lotes', Number(stockCero.stockActual) === 0 && (await prisma.loteBodega.count({ where: { itemId: stockCero.id } })) === 0)

    const dosVeces = await carga(confirmar())
    const c2 = await contar('PIL-01')
    chequear('Repetir la carga: idempotente (nada nuevo, nada cambia)', !dosVeces.aplicado && /Nada nuevo/.test(String(dosVeces.rechazo)) && JSON.stringify(c1) === JSON.stringify(c2) && dosVeces.informe.sinCambios.usuarios === 9 && dosVeces.informe.sinCambios.lotes === 14, JSON.stringify({ r: dosVeces.rechazo, c2 }))
    const diferente = path.join(tmp, 'dif'); copiarPlanillas(diferente, 'PIL-01', (f, t) => f === 'usuarios.csv' ? t.replace('jefe@piloto.local,Jefe Taller Piloto,JEFE_TALLER', 'jefe@piloto.local,Jefe Taller Piloto,PLANIFICADOR') : t)
    const dif = await carga({ dir: diferente, ...confirmar() })
    chequear('Un dato distinto de lo existente es conflicto: no se modifica nada', !dif.aplicado && dif.informe.errores.some(e => /lo difiere/.test(e.mensaje)) && (await prisma.usuario.findUniqueOrThrow({ where: { email: 'jefe@piloto.local' } })).rol === 'JEFE_TALLER')

    // rollback: una fila inválida no escribe nada; una falla a mitad de la escritura revierte todo
    const invalida = path.join(tmp, 'inv'); copiarPlanillas(invalida, 'PIL-02', (f, t) => f === 'lotes.csv' ? t.replace(/PIL-02,GRA-EP2-01,FAC-1009,6,/, 'PIL-02,GRA-EP2-01,FAC-1009,-6,') : t)
    const inv = await carga({ dir: invalida, faena: 'PIL-02', ...confirmar('PIL-02') })
    chequear('Rollback (fila inválida): se rechaza antes de escribir y no queda nada de PIL-02', !inv.aplicado && (await contar('PIL-02')) === null && (await prisma.usuario.count({ where: { email: { endsWith: '@pil02.local' } } })) === 0, JSON.stringify(inv.informe.errores.slice(0, 2)))
    const valida2 = path.join(tmp, 'v2'); copiarPlanillas(valida2, 'PIL-02')
    como(null)
    let fallo = ''
    try { await carga({ dir: valida2, faena: 'PIL-02', ...confirmar('PIL-02'), simularFalla: true }) } catch (e) { fallo = e instanceof Error ? e.message : String(e) }
    const rest = { faena: await prisma.faena.count({ where: { codigo: 'PIL-02' } }), usuarios: await prisma.usuario.count({ where: { email: { endsWith: '@pil02.local' } } }), items: await prisma.itemBodega.count({ where: { codigo: 'FIL-ACE-01', faena: { codigo: 'PIL-02' } } }), lotes: await prisma.loteBodega.count({ where: { documento: 'FAC-1001', item: { faena: { codigo: 'PIL-02' } } } }) }
    chequear('Rollback (falla a mitad de la escritura): no queda NADA de PIL-02', /Falla simulada/.test(fallo) && Object.values(rest).every(n => n === 0), JSON.stringify({ fallo, rest }))
    const ok2 = await carga({ dir: valida2, faena: 'PIL-02', ...confirmar('PIL-02') })
    chequear('Tras el rollback, la misma carga se aplica sin problemas', ok2.aplicado, String(ok2.rechazo))

    // ── 2. Simulacro operativo con los cinco roles ────────────────────────────────────────
    const S = { jefe: await sesionDe('jefe@piloto.local'), plan: await sesionDe('planificador@piloto.local'), mec1: await sesionDe('mecanico1@piloto.local'), mec2: await sesionDe('mecanico2@piloto.local'), op: await sesionDe('operador@piloto.local'), bod: await sesionDe('bodega@piloto.local'), adm: await sesionDe('admin@piloto.local') }
    const eq = async (c: string) => prisma.equipo.findFirstOrThrow({ where: { faenaId: faenaPil.id, codigo: c } })
    const cam1 = await eq('CAM-01'), cam2 = await eq('CAM-02'), exc = await eq('EXC-01')
    const item = async (c: string) => prisma.itemBodega.findFirstOrThrow({ where: { faenaId: faenaPil.id, codigo: c }, include: { lotes: { orderBy: { fechaRecepcion: 'asc' } } } })

    // horómetro
    await exito('Operador registra horómetro normal (EXC-01)', S.op, () => registrarHorometro({ equipoId: exc.id, horometro: 6102 }))
    como(S.op)
    const salto = (await registrarHorometro({ equipoId: exc.id, horometro: 9000 })) as { pendiente: boolean; id: string }
    chequear('Salto anómalo queda pendiente y no cambia el horómetro del equipo', salto.pendiente && Number((await eq('EXC-01')).horometroActual) === 6102)
    await espera('Operador no confirma el salto', S.op, () => confirmarLecturaHorometro(salto.id), /Sin permisos/)
    await exito('Jefe ve y rechaza... (confirma) la lectura pendiente', S.jefe, async () => { const p = await getLecturasPendientes(); if (!p.length) throw new Error('sin pendientes'); await confirmarLecturaHorometro(salto.id) })

    // falla → OT → repuesto FIFO → cierre
    await exito('Operador reporta falla de CAM-01 con detención', S.op, () => crearReporteFalla({ equipoId: cam1.id, descripcion: 'SIM piloto: ruido en motor', riesgoSeguridad: false, detencionSolicitada: true, impactoProductivo: 'ALTO' }))
    const rf = await prisma.reporteFalla.findFirstOrThrow({ where: { faenaId: faenaPil.id, descripcion: { contains: 'SIM piloto' } } })
    chequear('El equipo queda detenido pendiente de validación', (await eq('CAM-01')).estado === 'DETENIDO_PENDIENTE_VALIDACION')
    await exito('Jefe valida la detención', S.jefe, () => validarDetencion(rf.id, true))
    await espera('Operador NO crea OT directamente', S.op, () => crearOT({ equipoId: cam1.id, descripcionFalla: 'x' }), /Sin permisos/)
    await exito('Planificador convierte el reporte en OT', S.plan, () => convertirReporteEnOT(rf.id))
    const ot = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: faenaPil.id, equipoId: cam1.id } })
    const tec1 = await prisma.tecnico.findFirstOrThrow({ where: { usuario: { email: 'mecanico1@piloto.local' } } })
    await espera('Operador NO asigna técnico', S.op, () => asignarTecnico(ot.id, tec1.id), /Sin permisos/)
    await exito('Jefe asigna a Mecánico Uno', S.jefe, () => asignarTecnico(ot.id, tec1.id))
    await espera('Mecánico no asignado NO escribe en la bitácora', S.mec2, () => agregarBitacora(ot.id, { descripcion: 'x' }), /Sin permisos/)
    await exito('Mecánico asignado agrega bitácora', S.mec1, () => agregarBitacora(ot.id, { descripcion: 'Diagnóstico inicial: falla en inyector' }))
    const fil = await item('FIL-ACE-01')
    await exito('Mecánico solicita 10 filtros (abarca 2 lotes)', S.mec1, () => solicitarRepuesto({ otId: ot.id, descripcion: 'Filtro de aceite', cantidad: 10, unidad: 'un', itemBodegaId: fil.id }))
    const rep = await prisma.repuestoOT.findFirstOrThrow({ where: { otId: ot.id } })
    await espera('Bodega NO autoriza solicitudes', S.bod, () => autorizarSolicitud(rep.id, ot.id), /Sin permisos/)
    await espera('Mecánico NO autoriza solicitudes', S.mec1, () => autorizarSolicitud(rep.id, ot.id), /Sin permisos/)
    await exito('Planificador autoriza', S.plan, () => autorizarSolicitud(rep.id, ot.id))
    como(S.bod)
    const doble = await Promise.allSettled([entregarSolicitud(rep.id, ot.id, { precioUnit: 1 }), entregarSolicitud(rep.id, ot.id, { precioUnit: 1 })])
    const repE = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: rep.id } })
    const filD = await item('FIL-ACE-01')
    chequear('Bodega entrega (doble clic): una sola entrega, costo FIFO 8×18.000 + 2×19.500 = $183.000', doble.filter(d => d.status === 'fulfilled').length === 1 && Number(repE.total) === 183000 && Number(filD.stockActual) === 2 && Number(filD.lotes[0].cantidadSaldo) === 0 && Number(filD.lotes[1].cantidadSaldo) === 2, JSON.stringify({ total: Number(repE.total), stock: Number(filD.stockActual), saldos: filD.lotes.map(l => Number(l.cantidadSaldo)) }))
    await exito('Mecánico: DIAGNOSTICADO', S.mec1, () => cambiarEstadoOT(ot.id, 'DIAGNOSTICADO'))
    await exito('Jefe: EN_REPARACION', S.jefe, () => cambiarEstadoOT(ot.id, 'EN_REPARACION'))
    await exito('Mecánico: EN_VALIDACION (equipo vuelve a operar)', S.mec1, () => cambiarEstadoOT(ot.id, 'EN_VALIDACION'))
    chequear('CAM-01 sigue detenido hasta la liberación operacional', (await eq('CAM-01')).estado.startsWith('DETENIDO'))
    await espera('Cierre sin validación técnica se rechaza', S.plan, () => cambiarEstadoOT(ot.id, 'CERRADA'), /validación técnica/)
    await exito('Jefe valida técnicamente', S.jefe, () => validarTecnicamente(ot.id))
    await exito('Planificador cierra administrativamente', S.plan, () => cambiarEstadoOT(ot.id, 'CERRADA'))
    await exito('Planificador libera el equipo (reparación validada)', S.plan, () => liberarEquipo(cam1.id))
    chequear('CAM-01 vuelve a OPERATIVO', (await eq('CAM-01')).estado === 'OPERATIVO')

    // inspección → alerta → OT única
    await exito('Jefe crea plantilla de inspección de CAM-02', S.jefe, () => crearPlantilla({ equipoId: cam2.id, nombre: 'Inspección diaria CAM-02', items: [{ categoria: 'Frenos', descripcion: 'Freno de servicio', criticidadBase: 'CRITICO' as never, orden: 1 }] }))
    const plt = await prisma.plantillaInspeccion.findFirstOrThrow({ where: { faenaId: faenaPil.id }, include: { items: true } })
    const clave = 'sim-piloto-' + Date.now()
    como(S.op)
    const insp = await Promise.allSettled([1, 2].map(() => crearInspeccion({ equipoId: cam2.id, plantillaId: plt.id, turno: 'MAÑANA' as never, resultados: [{ itemId: plt.items[0].id, resultado: 'CRITICO' as never, observacion: 'sin frenos' }], claveIdempotencia: clave })).flat())
    chequear('Inspección crítica (doble clic): 1 sola inspección y 1 reporte, equipo detenido', insp.every(i => i.status === 'fulfilled') && (await prisma.inspeccionDiaria.count({ where: { claveIdempotencia: clave } })) === 1 && (await prisma.reporteFalla.count({ where: { equipoId: cam2.id, descripcion: { startsWith: 'Hallazgo crítico' } } })) === 1 && (await eq('CAM-02')).estado === 'DETENIDO_PENDIENTE_VALIDACION')
    const alerta = await prisma.alertaInspeccion.findFirstOrThrow({ where: { faenaId: faenaPil.id } })
    como(S.jefe)
    const gen = await Promise.allSettled([generarOTDesdeAlerta(alerta.id), generarOTDesdeAlerta(alerta.id)])
    chequear('La alerta genera una sola OT (doble clic)', gen.every(g => g.status === 'fulfilled') && (await prisma.ordenTrabajo.count({ where: { faenaId: faenaPil.id, equipoId: cam2.id } })) === 1)

    // SR con FIFO
    const man = await item('MAN-HID-01')
    await exito('Mecánico crea SR de 4 mangueras (2 lotes)', S.mec1, () => crearSR(ot.id, { items: [{ descripcion: 'Manguera hidráulica', cantidad: 4, unidad: 'un', itemBodegaId: man.id }], urgente: false }))
    const sr = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { faenaId: faenaPil.id } })
    await exito('Jefe: SR → RECIBIDA_FAENA', S.jefe, () => cambiarEstadoSR(sr.id, 'RECIBIDA_FAENA'))
    await exito('Bodega entrega la SR', S.bod, () => cambiarEstadoSR(sr.id, 'ENTREGADA'))
    const manD = await item('MAN-HID-01'), repSr = await prisma.repuestoOT.findFirstOrThrow({ where: { otId: ot.id, descripcion: 'Manguera hidráulica' } })
    chequear('SR entregada: FIFO 3×44.000 + 1×47.000 = $179.000 y stock 1', Number(repSr.total) === 179000 && Number(manD.stockActual) === 1, JSON.stringify({ total: Number(repSr.total), stock: Number(manD.stockActual) }))

    // permisos
    await espera('Mecánico NO crea ítems de bodega', S.mec1, () => crearItem({ codigo: 'X', descripcion: 'x', unidad: 'un', stockActual: 0, stockMinimo: 0, precioRef: 1 }), /Sin permisos/)
    await espera('Operador NO crea usuarios', S.op, () => crearUsuario({ nombre: 'x', email: 'x@x.cl', password: 'password123', rol: 'OPERADOR' }), /Sin permisos/)
    await espera('Jefe NO crea un ADMINISTRADOR', S.jefe, () => crearUsuario({ nombre: 'x', email: 'x@x.cl', password: 'password123', rol: 'ADMINISTRADOR' }), /Sin permisos/)

    // Estado de Pago con las tarifas cargadas
    como(S.adm)
    await exito('Administrador prepara el Estado de Pago con las tarifas cargadas', S.adm, () => prepararEstadoPago(faenaPil.id, '2026-09-19'))
    const ep = await prisma.estadoPago.findFirstOrThrow({ where: { faenaId: faenaPil.id }, include: { lineas: true } })
    chequear('El Estado de Pago tiene una línea por asignación vigente (5) y monto bruto > 0', ep.lineas.length === 5 && Number(ep.totalBruto) > 0, `${ep.lineas.length} líneas, bruto ${ep.totalBruto}`)
    await espera('Planificador NO aprueba el Estado de Pago', S.plan, () => aprobarEstadoPago(ep.id), /Sin permisos/)

    // ── 3. Invariantes finales y monitoreo ────────────────────────────────────────────────
    const malos = await invariantes()
    chequear('Tras TODAS las operaciones: stock = suma de lotes, sin negativos, entradas − salidas = stock, consumos FIFO completos', malos.length === 0, malos.join('; '))
    await new Promise(r => setTimeout(r, 1500)) // el registro de permisos rechazados se escribe sin esperar
    const mon = await ejecutarMonitoreo(prisma, { faenaCodigo: 'PIL-01' })
    const porId = (id: string) => mon.find(m => m.id === id)!.filas
    chequear('Monitoreo: sin diferencias stock/lotes ni alertas sin OT ni horómetros pendientes ni SR inconsistentes', porId('stock-vs-lotes').length === 0 && porId('alertas-sin-ot').length === 0 && porId('horometros-pendientes').length === 0 && porId('sr-detenidas').length === 0, JSON.stringify(mon.map(m => [m.id, m.filas.length])))
    chequear('Monitoreo: los intentos rechazados por permisos quedaron registrados', porId('permisos-rechazados').length > 0, JSON.stringify(porId('permisos-rechazados')))
    const conFuturo = await ejecutarMonitoreo(prisma, { faenaCodigo: 'PIL-01', ahora: new Date(Date.now() + 10 * 86_400_000) })
    chequear('Monitoreo: pasados 10 días detecta las OT abiertas sin movimiento y las alertas', conFuturo.find(m => m.id === 'ot-sin-movimiento')!.filas.length >= 1)

    const fallos = pasos.filter(p => !p.ok)
    expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([])
  }, 300_000)
})
