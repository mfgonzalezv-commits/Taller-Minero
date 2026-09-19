// Fases 3, 5 y 6: flujo operativo completo en SIM-02 con acciones reales y verificación de datos.
import { afterAll, describe, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { crearReporteFalla, convertirReporteEnOT } from '../src/actions/fallas'
import { asignarTecnico, agregarBitacora, cambiarEstadoOT, validarTecnicamente, anularOT } from '../src/actions/ot'
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
    const paso = async (nombre: string, s: unknown, fn: () => Promise<unknown>, verificar?: () => Promise<string | null>) => {
      como(s)
      try {
        await fn()
        const problema = verificar ? await verificar() : null
        pasos.push({ paso: nombre, ok: !problema, detalle: problema ?? 'ok' })
      } catch (e) { pasos.push({ paso: nombre, ok: false, detalle: (e instanceof Error ? e.message : String(e)).slice(0, 200) }) }
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
      return e.estado === 'DETENIDO' ? null : `equipo quedó ${e.estado}, se esperaba DETENIDO`
    })
    await paso('Jefe asigna técnico', jefe, () => asignarTecnico(otId, tec.id))
    await paso('Mecánico agrega bitácora', mec, () => agregarBitacora(otId, { descripcion: 'AUDIT diagnóstico inicial' }))
    await paso('Mecánico solicita repuesto', mec, () => solicitarRepuesto({ otId, descripcion: 'Repuesto SIM-02', cantidad: 2, unidad: 'un', itemBodegaId: item.id }), async () => {
      const r = await prisma.repuestoOT.findFirst({ where: { otId } }); if (r) repId = r.id; return r ? null : 'sin RepuestoOT'
    })
    await paso('Operador autoriza solicitud (no debería poder)', op, () => autorizarSolicitud(repId, otId))
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
    await paso('Doble clic: dos cambios idénticos a EN_REPARACION', jefe, async () => {
      await Promise.all([cambiarEstadoOT(otId, 'EN_REPARACION'), cambiarEstadoOT(otId, 'EN_REPARACION')])
    }, async () => {
      const h = await prisma.historialEstadoOT.count({ where: { otId, estadoNuevo: 'EN_REPARACION' } })
      return h === 1 ? null : `${h} historiales duplicados de EN_REPARACION`
    })
    await paso('Salto de estado inválido EN_REPARACION → ABIERTA', jefe, () => cambiarEstadoOT(otId, 'ABIERTA'), async () => 'permitió retroceder sin validación de transición')
    await paso('Cierre directo sin validación técnica', jefe, () => cambiarEstadoOT(otId, 'CERRADA'), async () => 'permitió CERRADA sin pasar por EN_VALIDACION')
    await paso('Reabrir OT', jefe, () => cambiarEstadoOT(otId, 'ABIERTA'))
    await paso('Pasar a EN_VALIDACION', jefe, () => cambiarEstadoOT(otId, 'EN_VALIDACION'), async () => {
      const e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } }); const o = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
      return e.estado === 'OPERATIVO' && o.fechaTerminoTrabajo ? null : `equipo ${e.estado}, término técnico ${o.fechaTerminoTrabajo}`
    })
    await paso('Validar técnicamente', jefe, () => validarTecnicamente(otId))
    await paso('Cerrar OT', jefe, () => cambiarEstadoOT(otId, 'CERRADA'), async () => {
      const o = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
      return o.fechaCierre ? null : 'sin fechaCierre'
    })
    await paso('Anular OT ya cerrada', jefe, () => anularOT(otId, 'AUDIT'), async () => 'permitió anular una OT cerrada')
    await paso('Auditoría registrada del flujo', jefe, async () => {}, async () => {
      const n = await prisma.registroAuditoria.count({ where: { faenaId: faena.id } })
      return n > 0 ? null : 'RegistroAuditoria vacío para la faena'
    })
  })
})
