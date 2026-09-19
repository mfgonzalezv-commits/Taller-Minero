// Importador de datos reales desde planillas CSV. Ver docs/IMPORTADOR_DATOS.md.
//
//   npx tsx scripts/importar-datos.ts --dir plantillas-carga/ejemplo-piloto --faena PIL-01            (dry-run: solo lectura)
//   npx tsx scripts/importar-datos.ts --dir ... --faena PIL-01 --apply --base erp_minera_dev \
//        --confirmo "CARGAR PIL-01 EN erp_minera_dev"
//
// Por defecto es DRY-RUN. Para escribir exige --apply, --base, --faena y la frase de confirmación.
// En producción además exige una autorización explícita que hoy NO está concedida.
import 'dotenv/config'
import path from 'path'
import { prisma } from '../src/lib/prisma'
import { nombreBaseDesdeUrl } from '../src/lib/db-guard'
import { ejecutarCarga } from '../src/lib/importador/ejecutar'

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (n: string) => process.argv.includes(`--${n}`)

async function main() {
  const dir = arg('dir'), faena = arg('faena')
  if (!dir || !faena) { console.error('Uso: --dir <carpeta con los CSV> --faena <CODIGO> [--apply --base <base> --confirmo "<frase>"]'); process.exit(1) }
  const baseActual = nombreBaseDesdeUrl(process.env.DATABASE_URL)
  console.log(`Base conectada: "${baseActual}" · faena: ${faena.toUpperCase()} · modo: ${flag('apply') ? 'APPLY' : 'DRY-RUN (solo lectura)'}\n`)

  const r = await ejecutarCarga(prisma, {
    dir: path.resolve(dir), faena, baseActual, apply: flag('apply'), base: arg('base'), confirmo: arg('confirmo'),
    simularFalla: flag('simular-falla'), carpetaSalida: path.join(__dirname, 'salida'),
  })
  console.log(r.texto)
  if (r.archivoInforme) console.log(`\nInforme guardado en ${r.archivoInforme}`)
  if (r.rechazo) { console.error(`\n🚫 ${r.rechazo}`); process.exit(2) }
  if (r.aplicado) {
    console.log('\n✅ Carga aplicada:', JSON.stringify(r.resultado?.creados))
    if (r.archivoCredenciales) console.log(`Contraseñas temporales generadas en ${r.archivoCredenciales} (entrégalas por un canal seguro y bórralas del disco).`)
  } else if (r.informe.errores.length) process.exit(2)
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) }).finally(() => prisma.$disconnect())
