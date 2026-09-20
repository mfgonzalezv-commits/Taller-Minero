// Verificación PREVIA a las migraciones de las decisiones operacionales (SOLO LECTURA).
//   npx tsx scripts/verificar-migracion-previa.ts
//   producción: railway run --service Taller-Minero -- npx tsx scripts/verificar-migracion-previa.ts
// Comprueba la versión de PostgreSQL y que ningún dato existente pueda impedir los índices nuevos.
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { nombreBaseDesdeUrl } from '../src/lib/db-guard'

async function main() {
  const fallas: string[] = []
  const ver = (await prisma.$queryRawUnsafe<{ v: string; n: string }[]>(`SELECT current_setting('server_version') AS v, current_setting('server_version_num') AS n`))[0]
  console.log(`Base "${nombreBaseDesdeUrl(process.env.DATABASE_URL)}" · PostgreSQL ${ver.v}`)
  if (Number(ver.n) < 120000) fallas.push(`PostgreSQL ${ver.v} < 12: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de la transacción de la migración`)

  const existe = async (obj: string) => (await prisma.$queryRawUnsafe<{ x: string | null }[]>(`SELECT to_regclass('${obj}')::text AS x`))[0].x !== null
  for (const t of ['solicitudes_ajuste_stock', 'notificaciones', 'liberaciones_equipo']) if (await existe(t)) fallas.push(`La tabla ${t} ya existe: la migración fallaría`)
  for (const i of ['estados_pago_faena_id_periodo_inicio_version_key', 'estados_pago_vigente_por_periodo', 'solicitudes_ajuste_stock_pendiente_por_item']) if (await existe(i)) fallas.push(`El índice ${i} ya existe`)
  const col = async (t: string, c: string) => (await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='${t}' AND column_name='${c}'`))[0].n > 0
  for (const [t, c] of [['usuarios', 'sistema_turno'], ['estados_pago', 'version'], ['pautas_mantenimiento', 'version'], ['solicitudes_repuesto', 'monto_solicitado']]) if (await col(t, c)) fallas.push(`La columna ${t}.${c} ya existe`)
  if (!(await existe('estados_pago_faena_id_periodo_inicio_key'))) fallas.push('No existe el índice único previo de estados_pago (se espera para poder reemplazarlo)')

  // Duplicados que impedirían los índices únicos nuevos
  const dupVig = await prisma.$queryRawUnsafe<{ faena_id: string; periodo_inicio: Date; n: number }[]>(`SELECT faena_id, periodo_inicio, count(*)::int AS n FROM estados_pago WHERE estado IN ('BORRADOR','PREPARADO','APROBADO') GROUP BY 1,2 HAVING count(*) > 1`)
  if (dupVig.length) fallas.push(`${dupVig.length} periodo(s) con más de un Estado de Pago vigente (impedirían el índice parcial)`)
  const dupPer = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM (SELECT 1 FROM estados_pago GROUP BY faena_id, periodo_inicio HAVING count(*) > 1) x`)
  if (dupPer[0].n) fallas.push(`${dupPer[0].n} periodo(s) con más de un documento (el índice actual lo impediría; revisar)`)

  const cont = await prisma.$queryRawUnsafe<{ ep: number; sr: number; pautas: number; usuarios: number }[]>(`SELECT (SELECT count(*)::int FROM estados_pago) AS ep, (SELECT count(*)::int FROM solicitudes_repuesto) AS sr, (SELECT count(*)::int FROM pautas_mantenimiento) AS pautas, (SELECT count(*)::int FROM usuarios) AS usuarios`)
  console.log('Filas existentes (no se modifican):', JSON.stringify(cont[0]))
  if (fallas.length) { console.log('\n🚫 NO aplicar todavía:\n- ' + fallas.join('\n- ')); process.exit(3) }
  console.log('✅ Sin obstáculos: PostgreSQL ≥ 12, sin objetos previos y sin duplicados que impidan los índices.')
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) }).finally(() => prisma.$disconnect())
