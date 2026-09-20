// Borra por completo una faena SIMULADA (SIM-01 / SIM-02) y todo lo que cuelga de ella,
// siguiendo las claves foráneas reales de la base (incluye datos creados por la auditoría:
// bitácoras, ajustes, solicitudes, alertas, auditoría...). SOLO erp_minera_dev.
// Uso: npx tsx scripts/auditoria/borrar-faena.ts SIM-02
import 'dotenv/config'
import { prisma } from '../../src/lib/prisma'
import { impedirEjecucionEnProduccion } from '../../src/lib/db-guard'

type Fk = { hija: string; col: string; padre: string }

export async function borrarFaenaSimulada(codigo: string) {
  impedirEjecucionEnProduccion('auditoria/borrar-faena')
  if (!/^(SIM|PIL)-\d+$/.test(codigo)) throw new Error(`Solo se pueden borrar faenas simuladas (SIM-nn / PIL-nn, solo en dev); recibido: ${codigo}`)
  const faena = await prisma.faena.findUnique({ where: { codigo } })
  if (!faena) return false

  const fks = await prisma.$queryRawUnsafe<Fk[]>(`
    SELECT c.conrelid::regclass::text AS hija, a.attname::text AS col, c.confrelid::regclass::text AS padre
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`)
  const hijas = (padre: string) => fks.filter(f => f.padre === padre)

  async function borrar(tabla: string, cond: string, ruta: string[]) {
    for (const f of hijas(tabla)) {
      if (ruta.includes(f.hija) || f.hija === tabla) continue
      await borrar(f.hija, `"${f.col}" IN (SELECT id FROM ${tabla} WHERE ${cond})`, [...ruta, tabla])
    }
    await prisma.$executeRawUnsafe(`DELETE FROM ${tabla} WHERE ${cond}`)
  }
  // Tablas con faena_id SIN clave foránea: el recorrido por FK no las alcanza.
  for (const t of ['notificaciones', 'liberaciones_equipo', 'solicitudes_ajuste_stock']) await prisma.$executeRawUnsafe(`DELETE FROM ${t} WHERE faena_id = '${faena.id}'`)
  await borrar('faenas', `id = '${faena.id}'`, [])
  return true
}

if (require.main === module) {
  borrarFaenaSimulada(process.argv[2] ?? '')
    .then(ok => console.log(ok ? `Faena ${process.argv[2]} borrada con todo su contenido` : 'La faena no existe'))
    .catch(e => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
