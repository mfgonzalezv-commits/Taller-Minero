// SOLO LECTURA. Lista los equipos activos actualmente NO operacionales que no tienen un episodio de detención abierto
// (por ejemplo, equipos detenidos antes de existir los episodios). No modifica nada ni recalcula Estados de Pago.
//   npx tsx scripts/verificar-equipos-sin-episodio.ts
//   producción: railway run --service Taller-Minero -- npx tsx scripts/verificar-equipos-sin-episodio.ts
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { nombreBaseDesdeUrl } from '../src/lib/db-guard'
import { ESTADOS_NO_OPERACIONALES } from '../src/lib/estados-equipo'

async function main() {
  const equipos = await prisma.equipo.findMany({ where: { activo: true, estado: { in: [...ESTADOS_NO_OPERACIONALES] } }, select: { id: true, codigo: true, estado: true, updatedAt: true, faena: { select: { codigo: true } } } })
  const abiertos = await prisma.detencionEquipo.findMany({ where: { fin: null, equipoId: { in: equipos.map(e => e.id) } }, select: { equipoId: true } })
  const sin = equipos.filter(e => !abiertos.some(a => a.equipoId === e.id))
  console.log(`Base "${nombreBaseDesdeUrl(process.env.DATABASE_URL)}": ${equipos.length} equipos no operacionales, ${sin.length} sin episodio abierto`)
  for (const e of sin) console.log(`- ${e.faena.codigo} ${e.codigo} (${e.estado}) desde ~${e.updatedAt.toISOString().slice(0, 10)}`)
  if (sin.length) console.log('\nEstos equipos no descontarán detención por episodio hasta que se registre su detención (solo cuentan por sus OT).')
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) }).finally(() => prisma.$disconnect())
