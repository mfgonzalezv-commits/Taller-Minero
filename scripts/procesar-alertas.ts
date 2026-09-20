// Ejecuta el motor de alertas una vez (solo escribe en la tabla de notificaciones internas).
//   npx tsx scripts/procesar-alertas.ts
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { nombreBaseDesdeUrl } from '../src/lib/db-guard'
import { procesarAlertas } from '../src/lib/alertas-servicio'

procesarAlertas(prisma)
  .then(r => console.log(`Base "${nombreBaseDesdeUrl(process.env.DATABASE_URL)}": ${r.generadas} alertas evaluadas, ${r.nuevas} notificaciones nuevas`))
  .catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
  .finally(() => prisma.$disconnect())
