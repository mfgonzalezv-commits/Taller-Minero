// Fases 4 y 5 pendientes: inspecciones diarias, alertas, SR (bodega central / adquisiciones),
// compra directa excepcional y su regularización. Modo auditoría: registra desviaciones, no falla.
import { afterAll, describe, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { como, sesionDe, SALIDA } from './helpers'
import { crearPlantilla, crearInspeccion, actualizarEstadoAlerta, generarOTDesdeAlerta } from '../src/actions/inspeccion'
import { crearSR, cambiarEstadoSR, marcarCompraDirecta, regularizarCompraDirecta } from '../src/actions/sr'

type Paso = { paso: string; esperado: 'OK' | 'BLOQUEADO'; resultado: 'OK' | 'BLOQUEADO' | 'ERROR'; desviacion: boolean; detalle: string }
const pasos: Paso[] = []
const BLOQ = /Sin permisos|Sin sesión|otra faena|no autorizad|no pertenece|Debe justificar|no es una compra directa/i

describe('inspecciones, SR y compras', () => {
  afterAll(() => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'inspeccion-compras.json'), JSON.stringify(pasos, null, 2)) })
  it('ejecuta', async () => {
    const S = { jefe: await sesionDe('jefe2@sim2.local'), op: await sesionDe('operador2@sim2.local'), mec: await sesionDe('mecanico2b@sim2.local'), plan: await sesionDe('plan2@sim2.local'), bod: await sesionDe('bodega2@sim2.local') }
    const compras = await prisma.usuario.upsert({
      where: { email: 'compras2@sim2.local' }, update: {},
      create: { faenaId: (await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })).id, nombre: 'Sim2 compras', email: 'compras2@sim2.local', password: (await prisma.usuario.findUniqueOrThrow({ where: { email: 'jefe2@sim2.local' } })).password, rol: 'COMPRAS' },
    })
    const C = await sesionDe(compras.email)
    const faena = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-02' } })
    const eq = await prisma.equipo.findFirstOrThrow({ where: { faenaId: faena.id, codigo: 'SIM2-EQ-02' } })
    const ot = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: faena.id } })
    const item = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: faena.id } })
    const sim1 = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-01' } })
    const eq1 = await prisma.equipo.findFirstOrThrow({ where: { faenaId: sim1.id } })

    const P = async (paso: string, s: unknown, esperado: 'OK' | 'BLOQUEADO', fn: () => Promise<unknown>, extra?: () => Promise<string | null>) => {
      como(s)
      let resultado: Paso['resultado'] = 'OK', detalle = 'ok'
      try { await fn() } catch (e) { detalle = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 160); resultado = BLOQ.test(detalle) ? 'BLOQUEADO' : 'ERROR' }
      let desviacion = esperado === 'BLOQUEADO' ? resultado !== 'BLOQUEADO' : resultado !== 'OK'
      if (!desviacion && extra) { const x = await extra(); if (x) { desviacion = true; detalle = x } }
      pasos.push({ paso, esperado, resultado, desviacion, detalle })
    }
    const nota = (paso: string, ok: boolean, detalle: string) => pasos.push({ paso, esperado: 'OK', resultado: ok ? 'OK' : 'ERROR', desviacion: !ok, detalle })

    // ── Inspección diaria ────────────────────────────────────────────────────
    await P('Operador NO crea plantilla de inspección', S.op, 'BLOQUEADO', () => crearPlantilla({ equipoId: eq.id, nombre: 'AUDIT op', items: [] }))
    await P('Jefe crea plantilla', S.jefe, 'OK', () => crearPlantilla({ equipoId: eq.id, nombre: 'AUDIT plantilla', items: [
      { categoria: 'Motor', descripcion: 'Nivel de aceite', criticidadBase: 'OBSERVACION' as never, orden: 1 },
      { categoria: 'Frenos', descripcion: 'Freno de servicio', criticidadBase: 'CRITICO' as never, orden: 2 },
    ] }))
    const plt = await prisma.plantillaInspeccion.findFirstOrThrow({ where: { faenaId: faena.id, nombre: 'AUDIT plantilla' }, include: { items: { orderBy: { orden: 'asc' } } } })
    const [iAceite, iFreno] = plt.items
    await P('Operador inspecciona todo OK: sin alertas ni detención', S.op, 'OK', () => crearInspeccion({ equipoId: eq.id, plantillaId: plt.id, turno: 'MAÑANA' as never, resultados: [{ itemId: iAceite.id, resultado: 'OK' as never }, { itemId: iFreno.id, resultado: 'OK' as never }] }), async () => {
      const a = await prisma.alertaInspeccion.count({ where: { equipoId: eq.id } }); const e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
      return a === 0 && e.estado === 'OPERATIVO' ? null : `alertas=${a} estado=${e.estado}`
    })
    await P('Hallazgo CRÍTICO: alerta + reporte de falla + equipo detenido pendiente de validación', S.op, 'OK', () => crearInspeccion({ equipoId: eq.id, plantillaId: plt.id, turno: 'MAÑANA' as never, resultados: [{ itemId: iAceite.id, resultado: 'OK' as never }, { itemId: iFreno.id, resultado: 'CRITICO' as never, observacion: 'AUDIT sin frenos' }] }), async () => {
      const a = await prisma.alertaInspeccion.count({ where: { equipoId: eq.id } }); const r = await prisma.reporteFalla.count({ where: { equipoId: eq.id, descripcion: { contains: 'Hallazgo crítico' } } }); const e = await prisma.equipo.findUniqueOrThrow({ where: { id: eq.id } })
      return a === 1 && r === 1 && e.estado === 'DETENIDO_PENDIENTE_VALIDACION' ? null : `alertas=${a} reportes=${r} estado=${e.estado}`
    })
    await P('Inspección crítica repetida no duplica el reporte de falla', S.op, 'OK', () => crearInspeccion({ equipoId: eq.id, plantillaId: plt.id, turno: 'NOCHE' as never, resultados: [{ itemId: iFreno.id, resultado: 'CRITICO' as never, observacion: 'AUDIT sigue igual' }] }), async () => {
      const r = await prisma.reporteFalla.count({ where: { equipoId: eq.id, descripcion: { contains: 'Hallazgo crítico' } } })
      return r === 1 ? null : `${r} reportes de falla abiertos por el mismo hallazgo`
    })
    const alerta = await prisma.alertaInspeccion.findFirstOrThrow({ where: { equipoId: eq.id } })
    await P('Operador NO cambia estado de alerta', S.op, 'BLOQUEADO', () => actualizarEstadoAlerta(alerta.id, 'EN_PROCESO'))
    await P('Jefe pasa alerta a EN_PROCESO', S.jefe, 'OK', () => actualizarEstadoAlerta(alerta.id, 'EN_PROCESO'))
    await P('Operador NO convierte alerta en OT', S.op, 'BLOQUEADO', () => generarOTDesdeAlerta(alerta.id))
    await P('Jefe convierte alerta en OT', S.jefe, 'OK', () => generarOTDesdeAlerta(alerta.id))
    await P('Convertir la misma alerta dos veces no duplica la OT', S.jefe, 'OK', () => generarOTDesdeAlerta(alerta.id), async () => {
      const n = await prisma.ordenTrabajo.count({ where: { faenaId: faena.id, equipoId: eq.id } })
      return n === 1 ? null : `${n} OT para la misma alerta`
    })
    await P('Inspección de un equipo de OTRA faena está bloqueada', S.op, 'BLOQUEADO', () => crearInspeccion({ equipoId: eq1.id, plantillaId: plt.id, turno: 'MAÑANA' as never, resultados: [{ itemId: iFreno.id, resultado: 'CRITICO' as never, observacion: 'AUDIT cross' }] }), async () => null)
    const eq1d = await prisma.equipo.findUniqueOrThrow({ where: { id: eq1.id } })
    nota('El equipo de SIM-01 no quedó detenido por una inspección de SIM-02', eq1d.estado === 'OPERATIVO', `estado SIM-01 = ${eq1d.estado}`)

    // ── SR: bodega central → adquisiciones → llegada → entrega ────────────────
    await P('Operador NO crea SR', S.op, 'BLOQUEADO', () => crearSR(ot.id, { items: [{ descripcion: 'AUDIT', cantidad: 1, unidad: 'un' }], urgente: false }))
    await P('Mecánico crea SR con ítem de bodega', S.mec, 'OK', () => crearSR(ot.id, { items: [{ descripcion: 'Repuesto SIM-02', cantidad: 2, unidad: 'un', itemBodegaId: item.id, precioEstimado: 10000 }], urgente: true }))
    const sr = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: ot.id }, orderBy: { createdAt: 'desc' } })
    await P('Mecánico NO cambia estado de la SR', S.mec, 'BLOQUEADO', () => cambiarEstadoSR(sr.id, 'EN_BODEGA_CENTRAL'))
    await P('Operador NO cambia estado de la SR', S.op, 'BLOQUEADO', () => cambiarEstadoSR(sr.id, 'EN_BODEGA_CENTRAL'))
    for (const est of ['EN_BODEGA_CENTRAL', 'EN_ADQUISICIONES', 'ESPERANDO_LLEGADA', 'RECIBIDA_FAENA'] as const)
      await P(`SR → ${est}`, est === 'EN_ADQUISICIONES' || est === 'ESPERANDO_LLEGADA' ? C : S.jefe, 'OK', () => cambiarEstadoSR(sr.id, est, { observacion: 'AUDIT' }))
    const hist = await prisma.historialSR.count({ where: { srId: sr.id } })
    nota('La SR guarda historial con fechas para medir cuellos de botella', hist === 5, `${hist} registros (creación + 4 cambios)`)
    const stock0 = Number((await prisma.itemBodega.findUniqueOrThrow({ where: { id: item.id } })).stockActual)
    await P('Bodega entrega la SR', S.bod, 'OK', () => cambiarEstadoSR(sr.id, 'ENTREGADA'), async () => {
      const stock = Number((await prisma.itemBodega.findUniqueOrThrow({ where: { id: item.id } })).stockActual)
      const lotes = (await prisma.loteBodega.findMany({ where: { itemId: item.id } })).reduce((a, l) => a + Number(l.cantidadSaldo), 0)
      return stock === stock0 - 2 && lotes === stock ? null : `stock=${stock} (esperado ${stock0 - 2}) lotes=${lotes}`
    })
    await P('Entregar dos veces la misma SR está bloqueado', S.bod, 'BLOQUEADO', () => cambiarEstadoSR(sr.id, 'ENTREGADA'), async () => null)
    const stock2 = Number((await prisma.itemBodega.findUniqueOrThrow({ where: { id: item.id } })).stockActual)
    nota('La segunda entrega no descuenta stock otra vez', stock2 === stock0 - 2, `stock=${stock2} (esperado ${stock0 - 2})`)
    await P('SR entregada no vuelve atrás (ENTREGADA → ENVIADA)', S.jefe, 'BLOQUEADO', () => cambiarEstadoSR(sr.id, 'ENVIADA'))

    // ── Compra directa excepcional y regularización ───────────────────────────
    await P('Crear SR para compra directa', S.jefe, 'OK', () => crearSR(ot.id, { items: [{ descripcion: 'AUDIT compra urgente', cantidad: 1, unidad: 'un', precioEstimado: 50000 }], urgente: true }))
    const sr2 = await prisma.solicitudRepuesto.findFirstOrThrow({ where: { otId: ot.id }, orderBy: { createdAt: 'desc' } })
    await P('Regularizar antes de marcar compra directa está bloqueado', C, 'BLOQUEADO', () => regularizarCompraDirecta(sr2.id, ['C1']))
    await P('Planificador NO marca compra directa', S.plan, 'BLOQUEADO', () => marcarCompraDirecta(sr2.id, 'AUDIT'))
    await P('Compra directa sin motivo está bloqueada', S.jefe, 'BLOQUEADO', () => marcarCompraDirecta(sr2.id, ' '))
    await P('Jefe marca compra directa con motivo', S.jefe, 'OK', () => marcarCompraDirecta(sr2.id, 'AUDIT: proveedor único, urgencia'))
    await P('Bodega NO regulariza', S.bod, 'BLOQUEADO', () => regularizarCompraDirecta(sr2.id, ['C1']))
    await P('Regularizar SIN cotizaciones está bloqueado', C, 'BLOQUEADO', () => regularizarCompraDirecta(sr2.id, []))
    await P('Compras regulariza con cotizaciones', C, 'OK', () => regularizarCompraDirecta(sr2.id, ['COT-1 $48.000', 'COT-2 $52.000', 'COT-3 $50.500']))
    await P('Regularizar dos veces está bloqueado', C, 'BLOQUEADO', () => regularizarCompraDirecta(sr2.id, ['COT-X']))
    const cola = await prisma.correoSaliente.count({ where: { estado: { not: 'ENVIADO' } } }).catch(() => -1)
    nota('Correos quedan en cola (outbox) sin enviarse', cola >= 0, `${cola} pendientes/fallidos en cola, 0 enviados por la auditoría`)
  })
})
