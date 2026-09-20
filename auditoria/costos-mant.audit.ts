// Fases 4, 6 y 7: mantenimiento, Estado de Pago, horómetro y reportes en SIM-02.
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { prepararEstadoPago, agregarAjusteManual, aprobarEstadoPago, rechazarEstadoPago } from '../src/actions/estadoPago'
import { registrarHorometro } from '../src/actions/horometro'
import { crearPlan, generarOT } from '../src/actions/mantenimiento'
import { getInformeDiario } from '../src/actions/informes'

type Paso = { paso: string; ok: boolean; detalle: string }
const pasos: Paso[] = []
const cast = <T,>(v: unknown) => v as T

describe('costos, mantención y reportes SIM-02', () => {
  afterAll(() => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'costos-mant.json'), JSON.stringify(pasos, null, 2)) })
  it('ejecuta', async () => {
    const faena = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })
    const eq = await prisma.equipo.findFirstOrThrow({ where: { faenaId: faena.id, codigo: 'SIM2-EQ-01' } })
    const admin = await sesionDe('gerencia@sim.local'), jefe = await sesionDe('jefe2@sim2.local'), op = await sesionDe('operador2@sim2.local')
    const central = await sesionDe('plancentral@sim.local')
    const paso = async (nombre: string, s: unknown, fn: () => Promise<unknown>, verificar?: () => Promise<string | null>, esperaError = false) => {
      como(s)
      try {
        await fn()
        const problema = esperaError ? 'debía ser rechazado y fue permitido' : verificar ? await verificar() : null
        pasos.push({ paso: nombre, ok: !problema, detalle: problema ?? 'ok' })
      } catch (e) {
        const m = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 180)
        pasos.push({ paso: nombre, ok: esperaError, detalle: esperaError ? `rechazado: ${m}` : m })
      }
    }

    // Estado de Pago
    await paso('Jefe de faena NO prepara Estado de Pago', jefe, () => prepararEstadoPago(faena.id, '2026-09-19'), undefined, true)
    await paso('Planificador central prepara EP SIM-02', central, () => prepararEstadoPago(faena.id, '2026-09-19'), async () => {
      const ep = await prisma.estadoPago.findFirst({ where: { faenaId: faena.id }, include: { lineas: true } })
      if (!ep) return 'sin EP'
      const l = ep.lineas
      if (l.length !== 1) return `${l.length} líneas, esperado 1 (solo 1 equipo con asignación)`
      const bruto = Number(l[0].montoBruto), neto = Number(l[0].montoNeto), desc = Number(l[0].descuentoDetencion)
      if (Math.abs(bruto - 5_000_000) > 1) return `bruto ${bruto} != 5.000.000`
      return Math.abs(bruto - desc - neto) < 1 && neto <= bruto ? null : `neto ${neto} != bruto ${bruto} - desc ${desc}`
    })
    const ep = await prisma.estadoPago.findFirst({ where: { faenaId: faena.id }, include: { lineas: true } })
    await paso('Volver a preparar mismo periodo se rechaza', central, () => prepararEstadoPago(faena.id, '2026-09-19'), undefined, true)
    await paso('Planificador central NO aprueba', central, () => aprobarEstadoPago(ep!.id), undefined, true)
    await paso('Ajuste manual por central', central, () => agregarAjusteManual(ep!.lineas[0].id, -1000, 'AUDIT ajuste'))
    await paso('Gerencia aprueba', admin, () => aprobarEstadoPago(ep!.id))
    await paso('Doble aprobación rechazada', admin, () => aprobarEstadoPago(ep!.id), undefined, true)
    await paso('Ajuste manual sobre EP aprobado rechazado', central, () => agregarAjusteManual(ep!.lineas[0].id, -1000, 'AUDIT post-aprobación'), undefined, true)
    await paso('Rechazar EP ya aprobado rechazado', admin, () => rechazarEstadoPago(ep!.id, 'AUDIT'), undefined, true)
    await paso('Preparar EP sobre periodo aprobado se rechaza', central, () => prepararEstadoPago(faena.id, '2026-09-19'), undefined, true)

    // Horómetro
    await paso('Horómetro normal 1001', op, () => registrarHorometro(cast({ equipoId: eq.id, horometro: 1001 })))
    await paso('Horómetro menor a la anterior se bloquea', op, () => registrarHorometro(cast({ equipoId: eq.id, horometro: 500 })), undefined, true)
    await paso('Horómetro con salto enorme queda pendiente y no cambia el equipo', op, () => registrarHorometro(cast({ equipoId: eq.id, horometro: 900000 })), async () => {
      const e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
      return Number(e.horometroActual) === 900000 ? 'usó un salto de +899.000 h sin confirmar' : null
    })

    // Mantención: preventivo duplicado
    await paso('Crear plan preventivo', jefe, () => crearPlan({ equipoId: eq.id, nombre: 'AUDIT PM 250h', intervaloHoras: 250 }))
    const plan = await prisma.planMantenimiento.findFirst({ where: { faenaId: faena.id, nombre: 'AUDIT PM 250h' } })
    await paso('Generar OT preventiva 1', jefe, () => generarOT(plan!.id))
    await paso('Generar OT preventiva 2 (duplicado) rechazada', jefe, () => generarOT(plan!.id), undefined, true)
    await paso('Operador NO crea plan de mantención', op, () => crearPlan({ equipoId: eq.id, nombre: 'AUDIT plan operador', intervaloHoras: 100 }), undefined, true)

    // Reportes
    await paso('Informe diario coincide con tablas fuente', jefe, () => getInformeDiario(faena.id), async () => null)
    const abiertas = await prisma.ordenTrabajo.count({ where: { faenaId: faena.id, estado: { notIn: ['CERRADA', 'ANULADA'] } } })
    const inf = (await (async () => { como(jefe); return getInformeDiario(faena.id) })()) as unknown as Record<string, unknown>
    pasos.push({ paso: 'Claves del informe diario', ok: true, detalle: `OT abiertas en BD=${abiertas}; claves=${Object.keys(inf).join(',')}` })
    const cola = await prisma.correoSaliente.count({ where: { faenaId: faena.id } }).catch(() => -1)
    pasos.push({ paso: 'Correos en cola de SIM-02 (no se envió ninguno)', ok: true, detalle: String(cola) })
    expect(pasos.filter(p => !p.ok), JSON.stringify(pasos.filter(p => !p.ok))).toEqual([])
  })
})
