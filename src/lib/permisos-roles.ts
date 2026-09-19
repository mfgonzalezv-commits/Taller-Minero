// Matriz de roles del negocio (decisiones definitivas de Matías). Lógica PURA,
// sin Prisma: las Server Actions la consultan y los tests la verifican.
import type { Rol } from './roles'

const CENTRALES: Rol[] = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL']
const GESTION_FAENA: Rol[] = ['JEFE_TALLER', 'PLANIFICADOR']

/** Roles que pueden asignar técnico, crear OT y crear planes de mantención. */
export const ROLES_GESTION_OT: Rol[] = [...CENTRALES, ...GESTION_FAENA]
export const ROLES_ASIGNAR_TECNICO: Rol[] = ROLES_GESTION_OT
export const ROLES_CREAR_OT: Rol[] = ROLES_GESTION_OT
export const ROLES_AUTORIZAR_REPUESTO: Rol[] = ROLES_GESTION_OT
export const ROLES_CREAR_PLAN: Rol[] = ROLES_GESTION_OT
/** Bitácora y diagnóstico: gestión + MECANICO (solo si está asignado a la OT, se valida en la acción). */
export const ROLES_BITACORA: Rol[] = [...ROLES_GESTION_OT, 'MECANICO']
/** Maestro de stock: solo ADMINISTRADOR y BODEGA. */
export const ROLES_CREAR_ITEM_BODEGA: Rol[] = ['ADMINISTRADOR', 'BODEGA']

/** Roles de faena que puede administrar un Jefe de Taller de faena. */
const ROLES_QUE_ADMINISTRA_JEFE: Rol[] = ['PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'OPERADOR']
/** Roles de faena que puede administrar un Jefe de Taller Central. */
const ROLES_FAENA: Rol[] = ['JEFE_TALLER', 'PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'OPERADOR']

/** Roles que el actor puede otorgar o modificar. */
export function rolesAdministrables(rolActor: Rol): Rol[] {
  if (rolActor === 'ADMINISTRADOR') return ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'GERENCIA', ...ROLES_FAENA]
  if (rolActor === 'JEFE_TALLER_CENTRAL') return ROLES_FAENA
  if (rolActor === 'JEFE_TALLER') return ROLES_QUE_ADMINISTRA_JEFE
  return []
}

export interface IntentoGestionUsuario {
  actorId: string
  actorRol: Rol
  /** undefined al crear. */
  objetivoId?: string
  /** Rol actual del usuario objetivo (undefined al crear). */
  objetivoRolActual?: Rol
  /** Rol que se quiere dejar (undefined si solo se activa/desactiva). */
  rolNuevo?: Rol
}

/** Devuelve un mensaje de error si el actor no puede hacer la operación; null si puede. */
export function validarGestionUsuario(i: IntentoGestionUsuario): string | null {
  const permitidos = rolesAdministrables(i.actorRol)
  if (permitidos.length === 0) return 'Sin permisos para administrar usuarios'
  if (i.objetivoId && i.objetivoId === i.actorId && i.rolNuevo && i.rolNuevo !== i.actorRol) return 'Nadie puede cambiar su propio rol'
  if (i.objetivoRolActual && !permitidos.includes(i.objetivoRolActual)) return 'Sin permisos para administrar un usuario con ese rol'
  if (i.rolNuevo && !permitidos.includes(i.rolNuevo)) return 'Sin permisos para otorgar ese rol'
  return null
}
