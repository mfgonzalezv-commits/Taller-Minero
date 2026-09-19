// Verificación de respaldos (SOLO LECTURA). Ver docs/RESPALDO_Y_RESTAURACION.md.
//   1) En la base de origen:   npx tsx scripts/verificar-restauracion.ts --snapshot salida.json
//   2) En la rama restaurada (DATABASE_URL apuntando a la rama):
//                              npx tsx scripts/verificar-restauracion.ts --verificar salida.json
// El snapshot guarda conteos por tabla y sumas de control; la verificación los compara.
import 'dotenv/config'
import fs from 'fs'
import { prisma } from '../src/lib/prisma'
import { nombreBaseDesdeUrl } from '../src/lib/db-guard'

async function foto() {
  const conteos: Record<string, number> = {
    faenas: await prisma.faena.count(), usuarios: await prisma.usuario.count(), equipos: await prisma.equipo.count(), asignaciones: await prisma.asignacionEquipoFaena.count(),
    ordenesTrabajo: await prisma.ordenTrabajo.count(), reportesFalla: await prisma.reporteFalla.count(), itemsBodega: await prisma.itemBodega.count(), lotes: await prisma.loteBodega.count(),
    movimientosBodega: await prisma.movimientoBodega.count(), repuestosOT: await prisma.repuestoOT.count(), solicitudesRepuesto: await prisma.solicitudRepuesto.count(),
    horometros: await prisma.horometroKm.count(), estadosPago: await prisma.estadoPago.count(), lineasEstadoPago: await prisma.estadoPagoLinea.count(), auditoria: await prisma.registroAuditoria.count(),
  }
  const stock = await prisma.itemBodega.aggregate({ _sum: { stockActual: true } })
  const saldo = await prisma.loteBodega.aggregate({ _sum: { cantidadSaldo: true } })
  const neto = await prisma.estadoPago.aggregate({ _sum: { totalNeto: true } })
  const ultima = await prisma.registroAuditoria.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  return { generado: new Date().toISOString(), base: nombreBaseDesdeUrl(process.env.DATABASE_URL), conteos, sumas: { stockActual: Number(stock._sum.stockActual ?? 0), saldoLotes: Number(saldo._sum.cantidadSaldo ?? 0), totalNetoEstadosPago: Number(neto._sum.totalNeto ?? 0) }, ultimaAuditoria: ultima?.createdAt.toISOString() ?? null }
}

async function main() {
  const i = (n: string) => { const k = process.argv.indexOf(n); return k >= 0 ? process.argv[k + 1] : undefined }
  const snap = i('--snapshot'), ver = i('--verificar')
  if (!snap && !ver) { console.error('Uso: --snapshot <archivo.json>  |  --verificar <archivo.json>'); process.exit(1) }
  if (ver && nombreBaseDesdeUrl(process.env.DATABASE_URL) === 'erp_minera') {
    console.error('🚫 --verificar debe apuntar a la RAMA RESTAURADA, no a producción (erp_minera): la comparación no probaría nada.')
    process.exit(1)
  }
  const f = await foto()
  if (snap) { fs.writeFileSync(snap, JSON.stringify(f, null, 2)); console.log(`Snapshot de "${f.base}" guardado en ${snap}`); console.log(JSON.stringify(f.conteos)); return }
  const esperado = JSON.parse(fs.readFileSync(ver as string, 'utf8')) as typeof f
  const dif: string[] = []
  for (const [k, v] of Object.entries(esperado.conteos)) if (f.conteos[k] !== v) dif.push(`${k}: esperado ${v} · restaurado ${f.conteos[k]}`)
  for (const [k, v] of Object.entries(esperado.sumas)) if (Math.abs((f.sumas as Record<string, number>)[k] - v) > 0.01) dif.push(`${k}: esperado ${v} · restaurado ${(f.sumas as Record<string, number>)[k]}`)
  if (f.sumas.stockActual !== f.sumas.saldoLotes) dif.push(`stock (${f.sumas.stockActual}) ≠ saldo de lotes (${f.sumas.saldoLotes}) en la base restaurada`)
  console.log(`Verificación de "${f.base}" contra el snapshot de "${esperado.base}" (${esperado.generado})`)
  if (dif.length) { console.log('DIFERENCIAS (esperables solo si hubo escrituras después del snapshot):\n- ' + dif.join('\n- ')); process.exit(3) }
  console.log('✅ La base restaurada coincide con el snapshot (conteos y sumas de control).')
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) }).finally(() => prisma.$disconnect())
