import { auth } from './auth'
import { prisma } from './prisma'
import {
  ROLES_ALCANCE_CENTRAL,
  ErrorAutorizacion,
  requireRolPermitido,
  requireAlcanceFaena,
} from './authz-core'
import type { SesionAutenticada } from './authz-core'

export { ROLES_ALCANCE_CENTRAL, ErrorAutorizacion, requireRolPermitido, requireAlcanceFaena }
export type { SesionAutenticada }

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
