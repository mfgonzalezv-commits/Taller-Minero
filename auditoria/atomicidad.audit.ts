// Atomicidad del episodio de detención, filtro por faena y estados no operacionales (SIM-02). Falla si algo no se cumple.
import { afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const falla = { abrir: false, vincular: false }
vi.mock('../src/lib/detencion-registro', async (original) => {
  const real = await original<typeof import('../src/lib/detencion-registro')>()
  return {
    ...real,
    abrirDetencion: async (...a: Parameters<typeof real.abrirDetencion>) => { if (falla.abrir) throw new Error('falla simulada al abrir la detención'); return real.abrirDetencion(...a) },
    vincularOtADetencion: async (...a: Parameters<typeof real.vincularOtADetencion>) => { if (falla.vincular) throw new Error('falla simulada al vincular la OT'); return real.vincularOtADetencion(...a) },
  }
})

import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { actualizarEstadoEquipo, liberarEquipo } from '../src/actions/equipos'
import { crearOT } from '../src/actions/ot'
import { crearSR, marcarCompraDirecta, solicitarAprobacionCompra, rechazarAprobacionCompra } from '../src/actions/sr'
import { detencionesYLiberaciones } from '../src/lib/detencion-registro'
import { ESTADOS_NO_OPERACIONALES } from '../src/lib/estados-equipo'

type Paso = { paso: string; ok: boolean; detalle: string }
const pasos: Paso[] = []

describe('atomicidad de la detención', () => {
  afterAll(() => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'atomicidad.json'), JSON.stringify(pasos, null, 2)) })
  it('ejecuta', async () => {
    const chequear = (paso: string, ok: boolean, detalle = 'ok') => pasos.push({ paso, ok, detalle: ok ? 'ok' : detalle })
    const faena = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })
    const sim1 = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-01' } })
    const jefe = await sesionDe('jefe2@sim2.local'), plan = await sesionDe('plan2@sim2.local')
    const nuevoEquipo = (codigo: string) => prisma.equipo.create({ data: { faenaId: faena.id, codigo, nombre: codigo, tipo: 'MAQUINARIA', costoHoraDetencion: 1000 } })
    const estado = async (id: string) => (await prisma.equipo.findUniqueOrThrow({ where: { id } })).estado
    const episodios = (id: string) => prisma.detencionEquipo.findMany({ where: { equipoId: id } })
    const intentar = async (fn: () => Promise<unknown>) => { try { await fn(); return null } catch (e) { return e instanceof Error ? e.message : String(e) } }

    // 1. actualizarEstadoEquipo: todo o nada
    const e1 = await nuevoEquipo('AT-1')
    como(jefe); falla.abrir = true
    const err1 = await intentar(() => actualizarEstadoEquipo(e1.id, 'DETENIDO'))
    falla.abrir = false
    chequear('Rollback: si falla la apertura del episodio, el estado del equipo NO cambia', /falla simulada/.test(err1 ?? '') && (await estado(e1.id)) === 'OPERATIVO' && (await episodios(e1.id)).length === 0, `${err1} ${await estado(e1.id)}`)
    await actualizarEstadoEquipo(e1.id, 'DETENIDO')
    chequear('Sin falla: el estado y el episodio se registran juntos', (await estado(e1.id)) === 'DETENIDO' && (await episodios(e1.id)).filter((e: { fin: Date | null }) => e.fin === null).length === 1)

    // 2. crearOT: OT + historial + checklist + estado + episodio + vinculación en una transacción
    const e2 = await nuevoEquipo('AT-2')
    const pauta = await prisma.pautaMantenimiento.create({ data: { faenaId: faena.id, nombre: 'AUDIT pauta atomicidad', marcaModelo: 'AUDIT', tipoMetrica: 'HRS', ciclosDisponibles: [250], items: { create: [{ componente: 'Filtro de aceite', categoria: 'FILTRO', ciclosReemplazar: [250], orden: 1 }, { componente: 'Aceite motor', categoria: 'FLUIDO', ciclosReemplazar: [250], orden: 2 }] } } })
    const ciclo = 250
    const rastros = async (id: string, desc: string) => {
      const ots = await prisma.ordenTrabajo.findMany({ where: { equipoId: id, descripcionFalla: desc }, select: { id: true } })
      const ids = ots.map(o => o.id)
      return { ots: ots.length, historial: await prisma.historialEstadoOT.count({ where: { otId: { in: ids } } }), checklist: await prisma.checklistItemOT.count({ where: { otId: { in: ids } } }), estado: await estado(id), episodios: (await episodios(id)).length }
    }
    const limpio = (r: Awaited<ReturnType<typeof rastros>>) => r.ots === 0 && r.historial === 0 && r.checklist === 0 && r.estado === 'OPERATIVO' && r.episodios === 0
    for (const paso of ['vincular', 'abrir'] as const) {
      const desc = `AUDIT atomicidad ${paso}`
      falla[paso] = true
      const err = await intentar(() => crearOT({ equipoId: e2.id, descripcionFalla: desc, tipoMantenimiento: 'PREVENTIVO', pautaId: pauta.id, cicloPM: ciclo }))
      falla[paso] = false
      const r = await rastros(e2.id, desc)
      chequear(`Rollback (falla al ${paso}): no queda OT, historial, checklist, cambio de estado ni episodio`, /falla simulada/.test(err ?? '') && limpio(r), `${err} ${JSON.stringify(r)}`)
    }
    const descOk = 'AUDIT atomicidad ok'
    await crearOT({ equipoId: e2.id, descripcionFalla: descOk, tipoMantenimiento: 'PREVENTIVO', pautaId: pauta.id, cicloPM: ciclo })
    const rOk = await rastros(e2.id, descOk), ep2 = await episodios(e2.id)
    chequear('Sin falla: OT, historial inicial, checklist, equipo detenido, episodio abierto y OT vinculada', rOk.ots === 1 && rOk.historial === 1 && rOk.checklist > 0 && rOk.estado === 'DETENIDO' && ep2.length === 1 && ep2[0].fin === null && ep2[0].otId !== null, JSON.stringify(rOk))

    // 3. Todos los estados no operacionales abren el episodio y la liberación lo cierra
    for (const est of ['TALLER', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'DETENIDO_PENDIENTE_VALIDACION'] as const) {
      const e = await nuevoEquipo(`AT-${est}`)
      como(jefe)
      await actualizarEstadoEquipo(e.id, est)
      const abierto = (await episodios(e.id)).filter(x => x.fin === null).length === 1
      como(plan)
      const errL = await intentar(() => liberarEquipo(e.id, 'Prueba de liberación'))
      const cerrado = (await episodios(e.id)).every(x => x.fin !== null) && (await estado(e.id)) === 'OPERATIVO'
      chequear(`${est}: abre el episodio y la liberación operacional lo cierra`, abierto && !errL && cerrado, `${errL} abierto=${abierto}`)
    }
    chequear('La definición compartida cubre los 5 estados no operacionales', ESTADOS_NO_OPERACIONALES.length === 5)
    como(jefe)
    const errSalida = await intentar(() => actualizarEstadoEquipo(e1.id, 'OPERATIVO'))
    chequear('Un equipo en estado no operacional no vuelve a operar por cambio directo', /solo sale de ese estado/.test(errSalida ?? ''))

    // 4. Equipo transferido entre faenas: lo de otra faena no contamina el cálculo
    const e4 = await nuevoEquipo('AT-TRANSF')
    const t = new Date()
    await prisma.detencionEquipo.create({ data: { equipoId: e4.id, faenaId: sim1.id, inicio: new Date(t.getTime() - 20 * 86_400_000), fin: new Date(t.getTime() - 10 * 86_400_000), origen: 'ESTADO' } })
    await prisma.liberacionEquipo.create({ data: { equipoId: e4.id, faenaId: sim1.id, liberadoPorId: plan.user.id, liberadoAt: new Date(t.getTime() - 10 * 86_400_000), tipo: 'LIBERACION' } })
    await prisma.detencionEquipo.create({ data: { equipoId: e4.id, faenaId: faena.id, inicio: new Date(t.getTime() - 3 * 86_400_000), fin: new Date(t.getTime() - 2 * 86_400_000), origen: 'ESTADO' } })
    const ventana = { inicio: new Date(t.getTime() - 30 * 86_400_000), termino: t }
    const enSim2 = await detencionesYLiberaciones(prisma, e4.id, faena.id, ventana), enSim1 = await detencionesYLiberaciones(prisma, e4.id, sim1.id, ventana)
    chequear('Equipo transferido: cada faena ve solo sus episodios y liberaciones', enSim2.detenciones.length === 1 && enSim2.liberaciones.length === 0 && enSim1.detenciones.length === 1 && enSim1.liberaciones.length === 1, JSON.stringify({ enSim2, enSim1 }))

    // 5. Reenvío de compra rechazada: dos reenvíos simultáneos con montos distintos -> un único ganador coherente
    como(jefe)
    const equipoC = await nuevoEquipo('AT-COMPRA')
    const otC = await prisma.ordenTrabajo.create({ data: { faenaId: faena.id, equipoId: equipoC.id, tipoMantenimiento: 'CORRECTIVO', estado: 'ABIERTA', prioridad: 'MEDIA', descripcionFalla: 'AUDIT reenvío concurrente', creadoPorId: jefe.user.id } })
    como(plan)
    await crearSR(otC.id, { items: [{ descripcion: 'sin precio', cantidad: 1, unidad: 'un' }], urgente: true })
    const srC = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: otC.id } })
    await marcarCompraDirecta(srC.id, 'Emergencia', 300_000)
    await solicitarAprobacionCompra(srC.id, 300_000, 300_000)
    const central = await sesionDe('jefecentral@sim.local')
    como(central); await rechazarAprobacionCompra(srC.id, 'Corregir monto')
    como(plan)
    const montos = [280_000, 350_000]
    const res = await Promise.allSettled(montos.map(m => solicitarAprobacionCompra(srC.id, m, m)))
    const ganadores = res.filter(r => r.status === 'fulfilled').length
    const fin = await prisma.solicitudRepuesto.findUniqueOrThrow({ where: { id: srC.id } })
    const audits = await prisma.registroAuditoria.findMany({ where: { entidadId: srC.id, accion: { in: ['CORREGIR_MONTO_ESTIMADO', 'SOLICITAR_APROBACION_COMPRA'] } }, orderBy: { createdAt: 'asc' } })
    const ganador = Number(fin.montoSolicitado)
    const corr = audits.filter(a => a.accion === 'CORREGIR_MONTO_ESTIMADO' && (a.valorNuevo as { montoEstimadoCompra: number }).montoEstimadoCompra !== 300_000)
    const solic = audits.filter(a => a.accion === 'SOLICITAR_APROBACION_COMPRA')
    chequear('Reenvíos simultáneos: hay un único ganador', ganadores === 1 && montos.includes(ganador), JSON.stringify({ ganadores, ganador, res: res.map(r => r.status) }))
    chequear('montoEstimadoCompra y montoSolicitado son del MISMO envío ganador', Number(fin.montoEstimadoCompra) === ganador, JSON.stringify({ est: Number(fin.montoEstimadoCompra), sol: ganador }))
    chequear('Auditoría efectiva: solo la del ganador (una corrección y una solicitud, con su monto)', corr.length === 1 && (corr[0].valorNuevo as { montoEstimadoCompra: number }).montoEstimadoCompra === ganador && solic.filter(a => (a.valorNuevo as { topeSolicitado: number }).topeSolicitado === ganador).length === 1 && solic.length === 2, JSON.stringify({ corr: corr.length, solic: solic.length }))

    const fallos = pasos.filter(p => !p.ok)
    expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([])
  }, 240_000)
})
