import { auth } from './auth'
import { prisma } from './prisma'
import {
  ROLES_ALCANCE_CENTRAL,
  ErrorAutorizacion,
  requireRolPermitido as requireRolPermitidoCore,
  requireAlcanceFaena as requireAlcanceFaenaCore,
} from './authz-core'
import type { SesionAutenticada } from './authz-core'
import type { Rol } from './roles'

export { ROLES_ALCANCE_CENTRAL, ErrorAutorizacion }
export type { SesionAutenticada }

// Deja constancia de cada intento rechazado por permisos (para el monitoreo del piloto). Nunca debe
// romper ni demorar la acción: se dispara sin esperar y cualquier falla al registrar se ignora.
// Tope por usuario y minuto: un cliente que repita una acción prohibida no puede inundar la tabla.
const MAX_DENEGACIONES_POR_MINUTO = 20
const ventanaDenegaciones = new Map<string, { desde: number; n: number }>()
export function _permitirRegistroDenegacion(userId: string, ahora = Date.now()): boolean {
  const v = ventanaDenegaciones.get(userId)
  if (!v || ahora - v.desde >= 60_000) { ventanaDenegaciones.set(userId, { desde: ahora, n: 1 }); return true }
  v.n++
  return v.n <= MAX_DENEGACIONES_POR_MINUTO
}

function registrarDenegacion(sesion: SesionAutenticada, detalle: Record<string, unknown>, error: unknown) {
  try {
    if (!_permitirRegistroDenegacion(sesion.userId)) return
    void prisma.registroAuditoria
      .create({
        data: {
          faenaId: sesion.faenaId, entidad: 'Permiso', entidadId: sesion.userId, accion: 'DENEGADO', usuarioId: sesion.userId,
          motivo: error instanceof Error ? error.message : 'Sin permisos',
          valorNuevo: { rol: sesion.rol, ...detalle } as object,
        },
      })
      .catch(() => {})
  } catch {
    /* el registro es de mejor esfuerzo */
  }
}

export function requireRolPermitido(sesion: SesionAutenticada, rolesPermitidos: Rol[]) {
  try {
    requireRolPermitidoCore(sesion, rolesPermitidos)
  } catch (e) {
    registrarDenegacion(sesion, { tipo: 'ROL', rolesPermitidos }, e)
    throw e
  }
}

export function requireAlcanceFaena(sesion: SesionAutenticada, faenaIdRegistro: string) {
  try {
    requireAlcanceFaenaCore(sesion, faenaIdRegistro)
  } catch (e) {
    registrarDenegacion(sesion, { tipo: 'FAENA', faenaRegistro: faenaIdRegistro }, e)
    throw e
  }
}

// Exige sesión activa con rol y faena asignados. Punto único de entrada
// para toda Server Action que mute o lea datos sensibles.
export async function requireSesion(): Promise<SesionAutenticada> {
  const session = await auth()
  if (!session?.user?.id || !session.user.rol || !session.user.faenaId) {
    throw new ErrorAutorizacion('Sin sesión')
  }
  return {
    userId: session.user.id,
    rol: session.user.rol as SesionAutenticada['rol'],
    faenaId: session.user.faenaId,
  }
}

type DatosAuditoria = {
  faenaId?: string | null
  entidad: string
  entidadId: string
  accion: string
  usuarioId?: string | null
  valorAnterior?: unknown
  valorNuevo?: unknown
  motivo?: string | null
}

// Registra una acción crítica (anulaciones, cambios de estado sensibles,
// ediciones administrativas) con quién, cuándo, qué cambió y por qué.
export async function auditar(datos: DatosAuditoria) {
  await prisma.registroAuditoria.create({
    data: {
      faenaId: datos.faenaId ?? null,
      entidad: datos.entidad,
      entidadId: datos.entidadId,
      accion: datos.accion,
      usuarioId: datos.usuarioId ?? null,
      valorAnterior: datos.valorAnterior === undefined ? undefined : (datos.valorAnterior as object),
      valorNuevo: datos.valorNuevo === undefined ? undefined : (datos.valorNuevo as object),
      motivo: datos.motivo ?? null,
    },
  })
}
