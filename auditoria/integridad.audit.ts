// Regresión de integridad (PR de integridad): FIFO transaccional, concurrencia, rollback,
// idempotencia, máquina de estados de OT y política de horómetro. Contra erp_minera_dev (SIM-02).
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { solicitarRepuesto, autorizarSolicitud, entregarSolicitud, eliminarRepuesto, agregarRepuesto } from '../src/actions/repuestos'
import { registrarMovimiento, solicitarAjusteStock, aprobarAjusteStock } from '../src/actions/bodega'
import { cambiarEstadoOT, validarTecnicamente, reabrirOT, agregarBitacora } from '../src/actions/ot'
import { registrarHorometro, confirmarLecturaHorometro, getLecturasPendientes, corregirLecturaHorometro } from '../src/actions/horometro'
import { aprobarEstadoPago, rechazarEstadoPago, prepararEstadoPago } from '../src/actions/estadoPago'

type Paso = { paso: string; ok: boolean; detalle: string }
const pasos: Paso[] = []

describe('integridad SIM-02', () => {
  afterAll(() => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'integridad.json'), JSON.stringify(pasos, null, 2)) })
  it('ejecuta', async () => {
    const jefe = await sesionDe('jefe2@sim2.local'), mec = await sesionDe('mecanico2b@sim2.local'), bod = await sesionDe('bodega2@sim2.local'), op = await sesionDe('operador2@sim2.local')
    const central = await sesionDe('plancentral@sim.local'), admin = await sesionDe('admin@sim.local')
    const faena = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })
    const item = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: faena.id } })
    const ot = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: faena.id } })
    const eq = await prisma.equipo.findUniqueOrThrow({ where: { id: ot.equipoId } })

    const chequear = (nombre: string, ok: boolean, detalle = 'ok') => pasos.push({ paso: nombre, ok, detalle: ok ? 'ok' : detalle })
    const espera = async (nombre: string, s: unknown, fn: () => Promise<unknown>, patron: RegExp) => {
      como(s)
      try { await fn(); chequear(nombre, false, 'debía ser rechazado y fue permitido') }
      catch (e) { const m = e instanceof Error ? e.message : String(e); chequear(nombre, patron.test(m), `mensaje inesperado: ${m.slice(0, 120)}`) }
    }
    const exito = async (nombre: string, s: unknown, fn: () => Promise<unknown>) => {
      como(s)
      try { await fn(); chequear(nombre, true) } catch (e) { chequear(nombre, false, (e instanceof Error ? e.message : String(e)).slice(0, 160)) }
    }
    const estadoBodega = async () => {
      const it = await prisma.itemBodega.findUniqueOrThrow({ where: { id: item.id } })
      const lotes = await prisma.loteBodega.findMany({ where: { itemId: item.id } })
      return { stock: Number(it.stockActual), lotes: lotes.reduce((a, l) => a + Number(l.cantidadSaldo), 0), negativos: lotes.filter(l => Number(l.cantidadSaldo) < 0).length }
    }
    const nuevoRepuesto = async (cant: number) => {
      como(mec); await solicitarRepuesto({ otId: ot.id, descripcion: `AUDIT ${cant}`, cantidad: cant, unidad: 'un', itemBodegaId: item.id })
      const r = await prisma.repuestoOT.findFirstOrThrow({ where: { otId: ot.id, descripcion: `AUDIT ${cant}` } })
      como(jefe); await autorizarSolicitud(r.id, ot.id)
      return r.id
    }

    // ── Bodega: FIFO transaccional ────────────────────────────────────────────
    const r1 = await nuevoRepuesto(5)
    como(bod)
    const dobles = await Promise.allSettled([entregarSolicitud(r1, ot.id, { precioUnit: 1 }), entregarSolicitud(r1, ot.id, { precioUnit: 1 })])
    chequear('Entrega simultánea de la misma solicitud: solo una pasa', dobles.filter(d => d.status === 'fulfilled').length === 1, JSON.stringify(dobles.map(d => d.status)))
    let e = await estadoBodega()
    chequear('Tras la entrega: stock = suma de lotes (15)', e.stock === 15 && e.lotes === 15, JSON.stringify(e))
    const rep1 = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: r1 } })
    chequear('Costo del repuesto = costo FIFO real ($10.000 x 5)', Number(rep1.total) === 50000 && Number(rep1.precioUnit) === 10000, `${rep1.precioUnit} / ${rep1.total}`)
    const consumos = await prisma.consumoLoteBodega.findMany({ where: { movimiento: { otId: ot.id, tipo: 'SALIDA' } } })
    chequear('Un solo movimiento de salida y consumos que suman 5', consumos.reduce((a, c) => a + Number(c.cantidad), 0) === 5, `consumos=${consumos.length}`)

    // rollback: pedir más que el stock
    const r2 = await nuevoRepuesto(100)
    await espera('Entrega mayor al stock se rechaza', bod, () => entregarSolicitud(r2, ot.id, { precioUnit: 1 }), /Stock insuficiente/)
    e = await estadoBodega()
    const rep2 = await prisma.repuestoOT.findUniqueOrThrow({ where: { id: r2 } })
    chequear('Rollback: la solicitud sigue AUTORIZADA y el stock intacto', rep2.estadoSolicitud === 'AUTORIZADO' && e.stock === 15 && e.lotes === 15, JSON.stringify({ estado: rep2.estadoSolicitud, ...e }))

    // salidas simultáneas
    como(bod)
    const sal = await Promise.allSettled([registrarMovimiento({ itemId: item.id, tipo: 'SALIDA', cantidad: 10 }), registrarMovimiento({ itemId: item.id, tipo: 'SALIDA', cantidad: 10 })])
    e = await estadoBodega()
    chequear('Dos salidas de 10 con stock 15: una pasa, la otra falla, sin negativos', sal.filter(d => d.status === 'fulfilled').length === 1 && e.stock === 5 && e.lotes === 5 && e.negativos === 0, JSON.stringify({ ok: sal.map(d => d.status), ...e }))

    // agregarRepuesto por bodega + devolución
    await exito('Entrega directa (agregarRepuesto) usa FIFO', bod, () => agregarRepuesto({ otId: ot.id, descripcion: 'AUDIT directo', cantidad: 2, unidad: 'un', precioUnit: 1, itemBodegaId: item.id }))
    e = await estadoBodega()
    chequear('Tras la entrega directa: stock = lotes (3)', e.stock === 3 && e.lotes === 3, JSON.stringify(e))
    const dir = await prisma.repuestoOT.findFirstOrThrow({ where: { otId: ot.id, descripcion: 'AUDIT directo' } })
    await exito('Eliminar repuesto devuelve stock como lote', jefe, () => eliminarRepuesto(dir.id, ot.id))
    e = await estadoBodega()
    chequear('Tras la devolución: stock = lotes (5)', e.stock === 5 && e.lotes === 5, JSON.stringify(e))
    const plan2 = await sesionDe('plan2@sim2.local'), centralJ = await sesionDe('jefecentral@sim.local')
    const ajustar = async (n: number) => { como(plan2); const id = await solicitarAjusteStock({ itemId: item.id, cantidadNueva: n, motivo: 'Inventario' }); como(centralJ); await aprobarAjusteStock(id) }
    await exito('Ajuste de inventario a 12 (solicita el Planificador, aprueba el Jefe Central)', bod, () => ajustar(12))
    e = await estadoBodega()
    chequear('Tras el ajuste: stock = lotes (12)', e.stock === 12 && e.lotes === 12, JSON.stringify(e))
    await exito('Ajuste de inventario a 4', bod, () => ajustar(4))
    e = await estadoBodega()
    chequear('Tras el ajuste a la baja: stock = lotes (4)', e.stock === 4 && e.lotes === 4, JSON.stringify(e))

    // ── Máquina de estados de la OT ──────────────────────────────────────────
    como(jefe)
    const dosClicks = await Promise.allSettled([cambiarEstadoOT(ot.id, 'DIAGNOSTICADO'), cambiarEstadoOT(ot.id, 'DIAGNOSTICADO')])
    const h1 = await prisma.historialEstadoOT.count({ where: { otId: ot.id, estadoNuevo: 'DIAGNOSTICADO' } })
    chequear('Doble clic al mismo estado: un solo historial y ninguna falla', h1 === 1 && dosClicks.every(d => d.status === 'fulfilled'), `historiales=${h1} ${JSON.stringify(dosClicks.map(d => d.status))}`)
    await exito('DIAGNOSTICADO → EN_REPARACION', jefe, () => cambiarEstadoOT(ot.id, 'EN_REPARACION'))
    await espera('EN_REPARACION → ABIERTA bloqueado', jefe, () => cambiarEstadoOT(ot.id, 'ABIERTA'), /Transición no permitida/)
    await espera('EN_REPARACION → CERRADA bloqueado (sin validación)', jefe, () => cambiarEstadoOT(ot.id, 'CERRADA'), /Transición no permitida/)
    await espera('Bitácora que propone CERRADA se rechaza con mensaje', mec, () => agregarBitacora(ot.id, { descripcion: 'AUDIT', estado: 'CERRADA' }), /no puede pasar la OT a CERRADA/)
    const ot2 = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: ot.id } })
    chequear('La bitácora no cerró la OT', ot2.estado === 'EN_REPARACION', ot2.estado)
    await exito('EN_REPARACION → EN_VALIDACION', jefe, () => cambiarEstadoOT(ot.id, 'EN_VALIDACION'))
    await espera('Cierre sin validación técnica bloqueado', jefe, () => cambiarEstadoOT(ot.id, 'CERRADA'), /validación técnica/)
    await espera('Planificador no valida técnicamente', await sesionDe('plan2@sim2.local'), () => validarTecnicamente(ot.id), /Sin permisos/)
    await exito('Jefe valida técnicamente', jefe, () => validarTecnicamente(ot.id))
    await exito('Planificador hace el cierre administrativo', await sesionDe('plan2@sim2.local'), () => cambiarEstadoOT(ot.id, 'CERRADA'))
    await espera('CERRADA → ABIERTA por cambiarEstadoOT bloqueado', jefe, () => cambiarEstadoOT(ot.id, 'ABIERTA'), /reapertura/)
    await espera('Reabrir sin motivo bloqueado', jefe, () => reabrirOT(ot.id, ' '), /motivo/)
    await espera('Mecánico no reabre', mec, () => reabrirOT(ot.id, 'AUDIT'), /Sin permisos/)
    await espera('Planificador no reabre', await sesionDe('plan2@sim2.local'), () => reabrirOT(ot.id, 'AUDIT'), /Sin permisos/)
    await exito('Jefe reabre con motivo', jefe, () => reabrirOT(ot.id, 'AUDIT: falla reaparece'))
    const ot3 = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: ot.id } })
    const aud = await prisma.registroAuditoria.count({ where: { entidadId: ot.id, accion: 'REABRIR' } })
    const eqd = await prisma.equipo.findUniqueOrThrow({ where: { id: ot.equipoId } })
    chequear('Reapertura: OT ABIERTA, sin cierre ni validación, equipo DETENIDO y auditoría', ot3.estado === 'ABIERTA' && !ot3.fechaCierre && !ot3.fechaValidacionTecnica && eqd.estado === 'DETENIDO' && aud === 1, JSON.stringify({ e: ot3.estado, eq: eqd.estado, aud }))
    await espera('Reabrir dos veces bloqueado', jefe, () => reabrirOT(ot.id, 'AUDIT'), /cerrada/)

    // ── Horómetro ────────────────────────────────────────────────────────────
    await exito('Lectura normal 1005', op, () => registrarHorometro({ equipoId: eq.id, horometro: 1005 }))
    await espera('Lectura menor bloqueada', op, () => registrarHorometro({ equipoId: eq.id, horometro: 1004 }), /menor a la anterior/)
    const antes = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
    como(op)
    const salto = (await registrarHorometro({ equipoId: eq.id, horometro: 5000 })) as { pendiente: boolean; id: string }
    const desp = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
    chequear('Salto anómalo queda pendiente y NO cambia el horómetro del equipo', salto.pendiente === true && Number(desp.horometroActual) === Number(antes.horometroActual), JSON.stringify({ pendiente: salto.pendiente, antes: Number(antes.horometroActual), despues: Number(desp.horometroActual) }))
    await espera('Operador no ve ni confirma pendientes', op, () => getLecturasPendientes(), /Sin permisos/)
    await espera('Operador no confirma', op, () => confirmarLecturaHorometro(salto.id), /Sin permisos/)
    await espera('Mecánico no confirma', mec, () => confirmarLecturaHorometro(salto.id), /Sin permisos/)
    await exito('Jefe ve lecturas pendientes', jefe, () => getLecturasPendientes())
    como(jefe)
    const dobleConf = await Promise.allSettled([confirmarLecturaHorometro(salto.id), confirmarLecturaHorometro(salto.id)])
    const conf = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
    chequear('Confirmación doble: una sola pasa y el horómetro queda en 5000', dobleConf.filter(d => d.status === 'fulfilled').length === 1 && Number(conf.horometroActual) === 5000, JSON.stringify({ r: dobleConf.map(d => d.status), h: Number(conf.horometroActual) }))
    const lect = await prisma.horometroKm.findFirstOrThrow({ where: { equipoId: eq.id, horometro: 5000 } })
    await espera('Corrección sin motivo bloqueada', jefe, () => corregirLecturaHorometro({ loturaOriginalId: lect.id, horometro: 1500, motivo: '' }), /motivo/)
    await exito('Corrección con motivo por Jefe', jefe, () => corregirLecturaHorometro({ loturaOriginalId: lect.id, horometro: 1500, motivo: 'AUDIT error de digitación' }))
    const corr = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
    chequear('La corrección deja el horómetro en 1500 y conserva la lectura original', Number(corr.horometroActual) === 1500 && (await prisma.horometroKm.count({ where: { id: lect.id } })) === 1, String(corr.horometroActual))

    // ── Estado de Pago ──────────────────────────────────────────────────────
    await exito('Central prepara Estado de Pago SIM-02', central, () => prepararEstadoPago(faena.id, '2026-09-19'))
    const ep = await prisma.estadoPago.findFirstOrThrow({ where: { faenaId: faena.id } })
    como(admin)
    const apr = await Promise.allSettled([aprobarEstadoPago(ep.id), aprobarEstadoPago(ep.id)])
    chequear('Aprobación doble simultánea: solo una pasa', apr.filter(d => d.status === 'fulfilled').length === 1, JSON.stringify(apr.map(d => d.status)))
    await espera('Aprobar de nuevo bloqueado', admin, () => aprobarEstadoPago(ep.id), /No se puede aprobar/)
    await espera('Rechazar un EP aprobado bloqueado', admin, () => rechazarEstadoPago(ep.id, 'AUDIT'), /No se puede rechazar/)
    const fin = await prisma.estadoPago.findUniqueOrThrow({ where: { id: ep.id } })
    chequear('El EP sigue APROBADO', fin.estado === 'APROBADO', fin.estado)

    const fallos = pasos.filter(p => !p.ok)
    expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([])
  })
})
