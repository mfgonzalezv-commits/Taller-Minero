import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'

export const SALIDA = path.join(__dirname, 'salida')
export type Veredicto = 'PERMITIDO' | 'BLOQUEADO' | 'ERROR_NEGOCIO'
export interface Resultado { id: string; actor: string; faenaActor: string; accion: string; objetivo: string; esperado: 'BLOQUEADO' | 'PERMITIDO'; veredicto: Veredicto; mensaje: string; hallazgo: boolean }
export const resultados: Resultado[] = []

export async function sesionDe(email: string) {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { email }, include: { faena: true } })
  return { user: { id: u.id, rol: u.rol, faenaId: u.faenaId, email, name: u.nombre }, _faena: u.faena.codigo }
}
export const como = (s: unknown) => { (globalThis as { __SESION?: unknown }).__SESION = s }

const BLOQ = /Sin permisos|Sin sesión|otra faena|no autorizad|propio rol|No puedes|no pertenece/i
export async function probar(p: { id: string; actor: string; sesion: Awaited<ReturnType<typeof sesionDe>>; accion: string; objetivo: string; esperado: 'BLOQUEADO' | 'PERMITIDO'; fn: () => Promise<unknown> }) {
  como(p.sesion)
  let veredicto: Veredicto = 'PERMITIDO', mensaje = 'ok'
  try { await p.fn() } catch (e) {
    mensaje = e instanceof Error ? e.message : String(e)
    veredicto = BLOQ.test(mensaje) ? 'BLOQUEADO' : 'ERROR_NEGOCIO'
  }
  const hallazgo = p.esperado === 'BLOQUEADO' && veredicto !== 'BLOQUEADO'
  resultados.push({ id: p.id, actor: p.actor, faenaActor: p.sesion._faena, accion: p.accion, objetivo: p.objetivo, esperado: p.esperado, veredicto, mensaje: mensaje.slice(0, 160), hallazgo })
}
export function guardar(nombre: string) {
  fs.mkdirSync(SALIDA, { recursive: true })
  fs.writeFileSync(path.join(SALIDA, `${nombre}.json`), JSON.stringify(resultados, null, 2))
}
