import { prisma } from '../src/lib/prisma'
async function main() {
  const r = await prisma.faena.updateMany({ data: { empresa: 'Araya Hermanos S.A.' } })
  console.log('Actualizado:', r.count, 'faena(s)')
}
main().catch(console.error).finally(() => prisma.$disconnect())
