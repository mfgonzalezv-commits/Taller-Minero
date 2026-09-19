// Análisis ESTÁTICO (sin base de datos) de las Server Actions: qué controles de
// autorización tiene cada función exportada. Uso: node scripts/auditoria/matriz-acciones.mjs > salida.md
import fs from 'fs'
import path from 'path'
const dir = 'src/actions'
const filas = []
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.ts'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8')
  const partes = src.split(/\n(?=export async function )/).slice(1)
  for (const p of partes) {
    const nombre = /export async function (\w+)/.exec(p)[1]
    const cuerpo = p.split(/\nexport /)[0]
    const sesion = /requireSesion\(\)/.test(cuerpo) ? 'requireSesion' : /await auth\(\)/.test(cuerpo) ? 'auth() manual' : 'NINGUNA'
    const rol = /requireRolPermitido\(/.test(cuerpo) ? 'requireRolPermitido' : /session\??\.user\??\.rol|sesion\.rol|rolUsuario/.test(cuerpo) ? 'chequeo manual de rol' : '—'
    const faena = /requireAlcanceFaena\(/.test(cuerpo) ? 'requireAlcanceFaena' : /faenaId:\s*(sesion|session)/.test(cuerpo) || /faenaId\s*===/.test(cuerpo) ? 'filtra por faena de sesión' : '—'
    const audita = /auditar\(/.test(cuerpo) ? 'sí' : '—'
    const muta = /\.(create|update|delete|upsert|createMany|updateMany|deleteMany|\$transaction)\(/.test(cuerpo) ? 'ESCRIBE' : 'lee'
    filas.push({ archivo: f, nombre, sesion, rol, faena, audita, muta })
  }
}
console.log('| Archivo | Acción | Tipo | Sesión | Rol | Faena | Auditoría |\n|---|---|---|---|---|---|---|')
for (const r of filas) console.log(`| ${r.archivo} | ${r.nombre} | ${r.muta} | ${r.sesion} | ${r.rol} | ${r.faena} | ${r.audita} |`)
console.error(`Total: ${filas.length}; sin sesión: ${filas.filter(r => r.sesion === 'NINGUNA').length}; escriben sin rol explícito: ${filas.filter(r => r.muta === 'ESCRIBE' && r.rol === '—').length}; escriben sin control de faena: ${filas.filter(r => r.muta === 'ESCRIBE' && r.faena === '—').length}`)
