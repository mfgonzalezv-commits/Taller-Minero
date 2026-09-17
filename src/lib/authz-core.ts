// Lógica pura de autorización — sin dependencias de Next.js, NextAuth ni Prisma,
// para que sea testeable de forma aislada. src/lib/authz.ts la envuelve con
// acceso a sesión/DB para uso real en Server Actions.
import type { Rol } from './roles'

export type SesionAutenticada = {
  userId: string
  rol: Rol
  faenaId: string
}

// Roles con alcance sobre todas las faenas (Central).
// Hoy solo ADMINISTRADOR. La Fase 2 agrega JEFE_TALLER_CENTRAL y PLANIFICADOR_CENTRAL.
export const ROLES_ALCANCE_CENTRAL: Rol[] = ['ADMINISTRADOR']

export class ErrorAutorizacion extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErrorAutorizacion'
  }
}

// Exige que el rol de la sesión esté en la lista permitida.
export function requireRolPermitido(sesion: SesionAutenticada, rolesPermitidos: Rol[]) {
  if (!rolesPermitidos.includes(sesion.rol)) {
    throw new ErrorAutorizacion('Sin permisos para esta acción')
  }
}

// Exige que el registro pertenezca a la faena de la sesión, salvo que el
// usuario tenga un rol con alcance central (ve/opera sobre todas las faenas).
export function requireAlcanceFaena(sesion: SesionAutenticada, faenaIdRegistro: string) {
  if (ROLES_ALCANCE_CENTRAL.includes(sesion.rol)) return
  if (sesion.faenaId !== faenaIdRegistro) {
    throw new ErrorAutorizacion('Sin permisos: el registro pertenece a otra faena')
  }
}
