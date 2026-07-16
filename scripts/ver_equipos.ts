import { prisma } from '../src/lib/prisma'
async function main() {
  const equipos = await prisma.equipo.findMany({
    select: { id: true, codigo: true, nombre: true, estado: true },
    orderBy: { codigo: 'asc' },
  })
  console.log(JSON.stringify(equipos, null, 2))
}
main().catch(console.error).finally(() => prisma.$disconnect())
