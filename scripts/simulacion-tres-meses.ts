// Simulación reproducible de 3 meses de operación (26-jun-2026 a 25-sep-2026)
// con datos 100% FICTICIOS, solo para erp_minera_dev.
//
// Uso:  npx tsx scripts/simulacion-tres-meses.ts          (falla si ya existe la faena SIM-01)
//       npx tsx scripts/simulacion-tres-meses.ts --reset  (borra SOLO lo de la faena SIM-01 y recarga)
//
// ESTE SCRIPT CREA EL ESCENARIO. No ejecuta los procesos reales de Taller
// Minero: inserta 2 Estados de Pago históricos sintéticos (APROBADOS) y NO el
// tercero. El tercer periodo (26-ago a 25-sep) debe prepararse desde la
// interfaz / prepararEstadoPago(), y la auditoría posterior compara ese
// resultado con el esperado que este script escribe en
// scripts/salida/esperado-sim01.json (calculado aparte, con la regla correcta
// de detención: ventanas recortadas al periodo y unidas).
//
// Reproducible: PRNG con semilla fija e IDs deterministas. No lee ni copia
// nada de producción; aborta si DATABASE_URL apunta a erp_minera.
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { hash } from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { impedirEjecucionEnProduccion } from '../src/lib/db-guard'
import { generarEscenario, planLimpieza, SIM_FAENA_CODIGO } from '../src/lib/simulacion-sim01'

impedirEjecucionEnProduccion('simulacion-tres-meses (datos ficticios de 3 meses)')

async function main() {
  const existente = await prisma.faena.findUnique({ where: { codigo: SIM_FAENA_CODIGO } })
  if (existente) {
    if (!process.argv.includes('--reset')) {
      console.error(`La faena ${SIM_FAENA_CODIGO} ya existe. Usa --reset para borrar SOLO sus datos y recargar.`)
      process.exit(1)
    }
    await limpiar(existente.id)
  }

  const e = generarEscenario(await hash('password123', 10))
  const faenaId = e.faenaId

  await prisma.faena.create({ data: { id: faenaId, codigo: SIM_FAENA_CODIGO, nombre: 'Faena Simulada 3 meses', empresa: 'Empresa Ficticia S.A.', ubicacion: 'Simulación (solo desarrollo)' } })
  await prisma.usuario.createMany({ data: e.usuarios })
  await prisma.tecnico.createMany({ data: e.tecnicos })
  await prisma.trabajador.createMany({ data: e.trabajadores })
  await prisma.equipo.createMany({ data: e.equipos as never })
  await prisma.asignacionEquipoFaena.createMany({ data: e.asignaciones as never })
  await prisma.itemBodega.createMany({ data: e.items })
  await prisma.loteBodega.createMany({ data: e.lotes as never })
  await prisma.ordenTrabajo.createMany({ data: e.ots as never })
  await prisma.historialEstadoOT.createMany({ data: e.historial as never })
  await prisma.movimientoBodega.createMany({ data: e.movimientos as never })
  await prisma.consumoLoteBodega.createMany({ data: e.consumos as never })
  await prisma.repuestoOT.createMany({ data: e.repuestos as never })
  await prisma.manoObraOT.createMany({ data: e.manoObra as never })
  await prisma.reporteFalla.createMany({ data: e.reportes as never })
  await prisma.horometroKm.createMany({ data: e.horometros as never })
  await prisma.estadoPago.createMany({ data: e.estadosPago as never })
  await prisma.estadoPagoLinea.createMany({ data: e.lineasPago as never })

  await verificar(faenaId, e.movimientos.length)

  const salida = path.join(__dirname, 'salida')
  fs.mkdirSync(salida, { recursive: true })
  fs.writeFileSync(path.join(salida, 'esperado-sim01.json'), JSON.stringify({ faena: SIM_FAENA_CODIGO, nota: 'Resultado ESPERADO (regla correcta: ventanas de detención recortadas al periodo y unidas). horasDetencionLogicaActual = lo que produciría prepararEstadoPago() con su regla actual.', periodos: e.esperados }, null, 2))

  console.log(`Simulación lista en faena ${SIM_FAENA_CODIGO}: ${e.equipos.length} equipos, ${e.ots.length} OT, ${e.repuestos.length} salidas FIFO, ${e.movimientos.length} movimientos de bodega, ${e.horometros.length} lecturas, 2 Estados de Pago históricos (el 3º NO se inserta).`)
  console.log('Esperado del periodo 3 escrito en scripts/salida/esperado-sim01.json')
  console.log('Login: admin@sim.local / jefe@sim.local / mecanico1@sim.local ... contraseña password123')
}

// Invariantes que deben cumplirse tras la carga (falla la corrida si no).
async function verificar(faenaId: string, nMovEsperados: number) {
  const falla = (m: string): never => { throw new Error(`Invariante violado: ${m}`) }

  // Bodega: entradas, salidas, lotes y stock final
  const items = await prisma.itemBodega.findMany({ where: { faenaId }, select: { id: true, codigo: true, stockActual: true } })
  const movs = await prisma.movimientoBodega.findMany({ where: { faenaId }, orderBy: { createdAt: 'asc' } })
  if (movs.length !== nMovEsperados) falla(`movimientos insertados ${movs.length} != ${nMovEsperados}`)
  for (const it of items) {
    const m = movs.filter(x => x.itemId === it.id)
    const ent = m.filter(x => x.tipo === 'ENTRADA').reduce((a, x) => a + Number(x.cantidad), 0)
    const sal = m.filter(x => x.tipo === 'SALIDA').reduce((a, x) => a + Number(x.cantidad), 0)
    const lotes = await prisma.loteBodega.findMany({ where: { itemId: it.id }, select: { cantidad: true, cantidadSaldo: true } })
    const sumSaldo = lotes.reduce((a, l) => a + Number(l.cantidadSaldo), 0)
    const sumCant = lotes.reduce((a, l) => a + Number(l.cantidad), 0)
    if (lotes.some(l => Number(l.cantidadSaldo) < 0)) falla(`lote con saldo negativo en ${it.codigo}`)
    if (Math.abs(ent - sumCant) > 0.001) falla(`entradas (${ent}) != suma de lotes (${sumCant}) en ${it.codigo}`)
    if (Math.abs(ent - sal - Number(it.stockActual)) > 0.001) falla(`entradas - salidas != stock final en ${it.codigo}`)
    if (Math.abs(sumSaldo - Number(it.stockActual)) > 0.001) falla(`saldo de lotes != stock final en ${it.codigo}`)
    // cadena cronológica de snapshots: cada "después" es el "antes" del siguiente
    const orden = [...m].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.tipo === b.tipo ? (a.tipo === 'ENTRADA' ? Number(a.stockAntes) - Number(b.stockAntes) : Number(b.stockAntes) - Number(a.stockAntes)) : a.tipo === 'ENTRADA' ? -1 : 1))
    let acum = 0
    for (const x of orden) {
      if (Math.abs(Number(x.stockAntes) - acum) > 0.001) falla(`snapshot antes roto en ${it.codigo}`)
      acum += x.tipo === 'ENTRADA' ? Number(x.cantidad) : -Number(x.cantidad)
      if (Math.abs(Number(x.stockDespues) - acum) > 0.001) falla(`snapshot después roto en ${it.codigo}`)
    }
  }
  const salidas = movs.filter(x => x.tipo === 'SALIDA')
  const cons = await prisma.consumoLoteBodega.findMany({ where: { lote: { item: { faenaId } } }, select: { movimientoId: true, cantidad: true, costoUnitario: true } })
  for (const s of salidas) {
    const c = cons.filter(x => x.movimientoId === s.id).reduce((a, x) => a + Number(x.cantidad), 0)
    if (Math.abs(c - Number(s.cantidad)) > 0.001) falla('consumos FIFO de una salida no suman su cantidad')
  }
  const rep = await prisma.repuestoOT.aggregate({ where: { faenaId }, _sum: { total: true } })
  const totalCons = cons.reduce((a, c) => a + Number(c.cantidad) * Number(c.costoUnitario), 0)
  if (Math.abs(totalCons - Number(rep._sum.total ?? 0)) > 1) falla('costo de repuestos != consumos FIFO')

  // Horómetro monótono
  const lect = await prisma.horometroKm.findMany({ where: { faenaId }, orderBy: [{ equipoId: 'asc' }, { fechaRegistro: 'asc' }], select: { equipoId: true, horometro: true } })
  const ult = new Map<string, number>()
  for (const l of lect) {
    const h = Number(l.horometro)
    if (h < (ult.get(l.equipoId) ?? -1)) falla('horómetro retrocede')
    ult.set(l.equipoId, h)
  }

  // Estados de Pago: solo 2 históricos, ninguno del periodo 3
  const eps = await prisma.estadoPago.findMany({ where: { faenaId }, select: { periodoInicio: true, estado: true } })
  if (eps.length !== 2 || eps.some(x => x.estado !== 'APROBADO')) falla('deben existir exactamente 2 Estados de Pago históricos APROBADOS')
}

async function limpiar(faenaId: string) {
  const db = prisma as unknown as Record<string, { deleteMany: (a: { where: unknown }) => Promise<unknown> }>
  for (const paso of planLimpieza(faenaId)) await db[paso.modelo].deleteMany({ where: paso.where })
  await prisma.faena.delete({ where: { id: faenaId } })
}

main().catch(err => { console.error(err); process.exit(1) }).finally(() => prisma.$disconnect())
