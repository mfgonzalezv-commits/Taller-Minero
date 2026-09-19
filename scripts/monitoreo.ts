// Monitoreo del piloto (SOLO LECTURA). Ver docs/MONITOREO_PILOTO.md.
//   npx tsx scripts/monitoreo.ts [--faena PIL-01]
// En producción: railway run --service Taller-Minero -- npx tsx scripts/monitoreo.ts --faena <CODIGO>
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { nombreBaseDesdeUrl } from '../src/lib/db-guard'
import { ejecutarMonitoreo, monitoreoATexto } from '../src/lib/monitoreo'

const i = process.argv.indexOf('--faena')
const faena = i >= 0 ? process.argv[i + 1] : undefined

async function main() {
  const ahora = new Date()
  const res = await ejecutarMonitoreo(prisma, { faenaCodigo: faena, ahora })
  console.log(monitoreoATexto(res, { base: nombreBaseDesdeUrl(process.env.DATABASE_URL), faena: faena?.toUpperCase(), ahora }))
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) }).finally(() => prisma.$disconnect())
