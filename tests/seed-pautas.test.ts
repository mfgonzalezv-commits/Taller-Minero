import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Regresión: /api/seed-pautas borraba y recreaba datos productivos desde una
// petición GET pública, sin autenticación. No debe volver a existir como
// ruta HTTP. La utilidad equivalente vive en scripts/seed-pautas.ts,
// ejecutable solo localmente vía CLI (npx tsx), nunca por la web.
describe('seguridad: seed de pautas no expuesto por HTTP', () => {
  const apiDir = path.join(__dirname, '..', 'src', 'app', 'api')

  it('no existe ninguna ruta App Router bajo /api/seed-pautas', () => {
    const rutaEliminada = path.join(apiDir, 'seed-pautas')
    expect(fs.existsSync(rutaEliminada)).toBe(false)
  })

  it('ninguna ruta bajo src/app/api define un handler GET que borre PautaMantenimiento', () => {
    const rutasConDeleteMany: string[] = []

    function recorrer(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          recorrer(full)
        } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
          const contenido = fs.readFileSync(full, 'utf8')
          const tieneGET = /export\s+(async\s+)?function\s+GET/.test(contenido)
          const borraPautas = /pautaMantenimiento\.deleteMany/.test(contenido)
          if (tieneGET && borraPautas) {
            rutasConDeleteMany.push(full)
          }
        }
      }
    }

    recorrer(apiDir)
    expect(rutasConDeleteMany).toEqual([])
  })

  it('el script local de seed de pautas existe y no está bajo src/app (no es una ruta HTTP)', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'seed-pautas.ts')
    expect(fs.existsSync(scriptPath)).toBe(true)
  })

  it('el script local no contiene rutas de Windows hardcodeadas (C:\\Users\\...)', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'seed-pautas.ts')
    const contenido = fs.readFileSync(scriptPath, 'utf8')
    expect(contenido).not.toMatch(/C:\\\\Users/i)
  })
})
