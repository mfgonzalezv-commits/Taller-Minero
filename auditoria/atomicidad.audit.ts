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
    chequear('Sin falla: el estado y el episodio se registran juntos', (await estado(e1.id)) === 'DETENIDO' && (await episodios(e1.id)).filter(e => e.fin === null).length === 1)

    // 2. crearOT: estado + apertura + vinculación en una transacción
    const e2 = await nuevoEquipo('AT-2')
    falla.vincular = true
    const err2 = await intentar(() => crearOT({ equipoId: e2.id, descripcionFalla: 'AUDIT atomicidad vincular' }))
    falla.vincular = false
    chequear('Rollback: si falla la vinculación, el equipo NO queda detenido ni con episodio', /falla simulada/.test(err2 ?? '') && (await estado(e2.id)) === 'OPERATIVO' && (await episodios(e2.id)).length === 0, `${err2} ${await estado(e2.id)}`)
    falla.abrir = true
    const err3 = await intentar(() => crearOT({ equipoId: e2.id, descripcionFalla: 'AUDIT atomicidad abrir' }))
    falla.abrir = false
    chequear('Rollback: si falla la apertura, el equipo NO queda detenido', /falla simulada/.test(err3 ?? '') && (await estado(e2.id)) === 'OPERATIVO' && (await episodios(e2.id)).length === 0)
    await crearOT({ equipoId: e2.id, descripcionFalla: 'AUDIT atomicidad ok' })
    const ep2 = await episodios(e2.id)
    chequear('Sin falla: equipo detenido, episodio abierto y OT vinculada', (await estado(e2.id)) === 'DETENIDO' && ep2.length === 1 && ep2[0].fin === null && ep2[0].otId !== null)

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

    const fallos = pasos.filter(p => !p.ok)
    expect(fallos, JSON.stringify(fallos, null, 1)).toEqual([])
  }, 240_000)
})
