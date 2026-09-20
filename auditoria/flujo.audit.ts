// Fases 3, 5 y 6: flujo operativo completo en SIM-02 con acciones reales y verificación de datos.
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { crearReporteFalla, convertirReporteEnOT } from '../src/actions/fallas'
import { asignarTecnico, agregarBitacora, cambiarEstadoOT, validarTecnicamente, anularOT, reabrirOT } from '../src/actions/ot'
import { solicitarRepuesto, autorizarSolicitud, entregarSolicitud } from '../src/actions/repuestos'
import { registrarMovimiento } from '../src/actions/bodega'
import { registrarHorometro } from '../src/actions/horometro'

type Paso = { paso: string; ok: boolean; detalle: string }
const pasos: Paso[] = []
const cast = <T,>(v: unknown) => v as T

describe('flujo operativo SIM-02', () => {
  afterAll(() => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'flujo.json'), JSON.stringify(pasos, null, 2)) })
  it('falla → OT → repuesto → cierre', async () => {
    const jefe = await sesionDe('jefe2@sim2.local'), mec = await sesionDe('mecanico2b@sim2.local'), op = await sesionDe('operador2@sim2.local'), bod = await sesionDe('bodega2@sim2.local')
    const faena = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })
    const eq = await prisma.equipo.findFirstOrThrow({ where: { faenaId: faena.id, codigo: 'SIM2-EQ-01' } })
    const tec = await prisma.tecnico.findFirstOrThrow({ where: { faenaId: faena.id } })
    const item = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: faena.id } })
    const paso = async (nombre: string, s: unknown, fn: () => Promise<unknown>, verificar?: () => Promise<string | null>, rechazado?: RegExp) => {
      como(s)
      try {
        await fn()
        const problema = rechazado ? 'debía ser rechazado y fue permitido' : verificar ? await verificar() : null
        pasos.push({ paso: nombre, ok: !problema, detalle: problema ?? 'ok' })
      } catch (e) {
        const m = (e instanceof Error ? e.message : String(e)).slice(0, 200)
        pasos.push({ paso: nombre, ok: rechazado ? rechazado.test(m) : false, detalle: rechazado ? `rechazado: ${m}` : m })
      }
    }
    let otId = ''
    let repId = ''

    await paso('Operador registra horómetro', op, () => registrarHorometro(cast({ equipoId: eq.id, horometro: 1010 })))
    await paso('Operador reporta falla', op, () => crearReporteFalla({ equipoId: eq.id, descripcion: 'AUDIT flujo: ruido en motor', riesgoSeguridad: false, detencionSolicitada: true, impactoProductivo: 'ALTO' }))
    const rf = await prisma.reporteFalla.findFirstOrThrow({ where: { faenaId: faena.id, descripcion: { contains: 'AUDIT flujo' } } })
    await paso('Jefe convierte reporte en OT', jefe, () => convertirReporteEnOT(rf.id), async () => {
      const ot = await prisma.ordenTrabajo.findFirst({ where: { faenaId: faena.id, descripcionFalla: { contains: 'AUDIT flujo' } } })
      if (!ot) return 'no se creó OT'
      otId = ot.id
      const e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
      return e.estado === 'DETENIDO_PENDIENTE_VALIDACION' ? null : `equipo quedó ${e.estado}, se esperaba DETENIDO_PENDIENTE_VALIDACION`
    })
    await paso('Jefe asigna técnico', jefe, () => asignarTecnico(otId, tec.id))
    await paso('Mecánico agrega bitácora', mec, () => agregarBitacora(otId, { descripcion: 'AUDIT diagnóstico inicial' }))
    await paso('Mecánico solicita repuesto', mec, () => solicitarRepuesto({ otId, descripcion: 'Repuesto SIM-02', cantidad: 2, unidad: 'un', itemBodegaId: item.id }), async () => {
      const r = await prisma.repuestoOT.findFirst({ where: { otId } }); if (r) repId = r.id; return r ? null : 'sin RepuestoOT'
    })
    await paso('Operador NO autoriza solicitud', op, () => autorizarSolicitud(repId, otId), undefined, /Sin permisos/)
    await paso('Jefe autoriza solicitud', jefe, () => autorizarSolicitud(repId, otId))
    await paso('Bodega entrega repuesto (FIFO)', bod, () => entregarSolicitud(repId, otId, { precioUnit: 10000, itemBodegaId: item.id }), async () => {
      const it = await prisma.itemBodega.findUniqueOrThrow({ where: { id: item.id } })
      const lotes = await prisma.loteBodega.findMany({ where: { itemId: item.id } })
      const sum = lotes.reduce((a, l) => a + Number(l.cantidadSaldo), 0)
      return Number(it.stockActual) === sum && Number(it.stockActual) === 18 ? null : `stock ${it.stockActual} vs lotes ${sum} (esperado 18)`
    })
    await paso('Salida de bodega mayor al stock es rechazada', bod, async () => {
      let rechazo = false
      try { await registrarMovimiento({ itemId: item.id, tipo: 'SALIDA', cantidad: 9999 }) } catch { rechazo = true }
      if (!rechazo) throw new Error('permitió stock negativo')
    })
    await paso('Diagnóstico y paso a reparación (doble clic)', jefe, async () => {
      await cambiarEstadoOT(otId, 'DIAGNOSTICADO')
      await Promise.all([cambiarEstadoOT(otId, 'EN_REPARACION'), cambiarEstadoOT(otId, 'EN_REPARACION')])
    }, async () => {
      const h = await prisma.historialEstadoOT.count({ where: { otId, estadoNuevo: 'EN_REPARACION' } })
      return h === 1 ? null : `${h} historiales de EN_REPARACION (se esperaba 1)`
    })
    await paso('EN_REPARACION → ABIERTA bloqueado', jefe, () => cambiarEstadoOT(otId, 'ABIERTA'), undefined, /Transición no permitida/)
    await paso('Cierre directo sin validación técnica bloqueado', jefe, () => cambiarEstadoOT(otId, 'CERRADA'), undefined, /Transición no permitida|validación técnica/)
        await paso('Pasar a EN_VALIDACION', jefe, () => cambiarEstadoOT(otId, 'EN_VALIDACION'), async () => {
      const e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } }); const o = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
      return e.estado.startsWith('DETENIDO') && o.fechaTerminoTrabajo ? null : `equipo ${e.estado} (debe seguir detenido hasta la liberación), término técnico ${o.fechaTerminoTrabajo}`
    })
    await paso('Validar técnicamente', jefe, () => validarTecnicamente(otId))
    await paso('Cerrar OT', jefe, () => cambiarEstadoOT(otId, 'CERRADA'), async () => {
      const o = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
      return o.fechaCierre ? null : 'sin fechaCierre'
    })
    await paso('Anular OT ya cerrada bloqueado', jefe, () => anularOT(otId, 'AUDIT'), undefined, /No se puede anular/)
    await paso('Reabrir OT con la acción específica', jefe, () => reabrirOT(otId, 'AUDIT flujo: reincidencia'))
    await paso('Auditoría registrada del flujo', jefe, async () => {}, async () => {
      const n = await prisma.registroAuditoria.count({ where: { faenaId: faena.id } })
      return n > 0 ? null : 'RegistroAuditoria vacío para la faena'
    })
    expect(pasos.filter(p => !p.ok), JSON.stringify(pasos.filter(p => !p.ok))).toEqual([])
  })
})
