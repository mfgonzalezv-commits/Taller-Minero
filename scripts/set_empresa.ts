import { prisma } from '../src/lib/prisma'
import { impedirEjecucionEnProduccion } from '../src/lib/db-guard'

impedirEjecucionEnProduccion('set_empresa (actualización masiva de prueba)')

async function main() {
  const r = await prisma.faena.updateMany({ data: { empresa: 'Araya Hermanos S.A.' } })
  console.log('Actualizado:', r.count, 'faena(s)')
}
main().catch(console.error).finally(() => prisma.$disconnect())
