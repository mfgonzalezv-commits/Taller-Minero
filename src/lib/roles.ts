export type Rol =
  | 'ADMINISTRADOR'
  | 'JEFE_TALLER_CENTRAL'
  | 'PLANIFICADOR_CENTRAL'
  | 'JEFE_TALLER'
  | 'PLANIFICADOR'
  | 'MECANICO'
  | 'BODEGA'
  | 'COMPRAS'
  | 'GERENCIA'
  | 'OPERADOR'

// Prefijos de ruta → roles que pueden acceder
const RUTAS_PROTEGIDAS: { prefijo: string; roles: Rol[] }[] = [
  { prefijo: '/usuarios',           roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'] },
  { prefijo: '/equipos/nuevo',      roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'] },
  { prefijo: '/reportes',           roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'GERENCIA'] },
  { prefijo: '/bodega',             roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'BODEGA', 'COMPRAS'] },
  { prefijo: '/mantenimiento',      roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO'] },
  { prefijo: '/compras',            roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER', 'COMPRAS'] },
  { prefijo: '/trabajadores',       roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'] },
  { prefijo: '/faenas',             roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'] },
  { prefijo: '/arriendos',          roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'GERENCIA'] },
  { prefijo: '/informes',           roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'GERENCIA'] },
]

// Roles cuya faena asignada es "Central" — ven y operan sobre todas las faenas.
export const ROLES_CENTRALES: Rol[] = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL']

export function puedeAcceder(rol: string, pathname: string): boolean {
  for (const { prefijo, roles } of RUTAS_PROTEGIDAS) {
    if (pathname === prefijo || pathname.startsWith(prefijo + '/')) {
      return (roles as string[]).includes(rol)
    }
  }
  return true
}

export function requireRol(rol: string | undefined, roles: Rol[]) {
  if (!rol || !(roles as string[]).includes(rol)) {
    throw new Error('Sin permisos para esta acción')
  }
}

// Items de nav con su control de acceso. `principal: true` marca los accesos
// directos que van siempre visibles en la barra; el resto se agrupa bajo el
// menú "Módulos" (ver TopBar.tsx) para que no compitan todos en una sola
// fila horizontal — es solo una preferencia de presentación, no cambia qué
// rutas puede ver cada rol (eso lo sigue decidiendo únicamente `roles` acá
// y RUTAS_PROTEGIDAS/las Server Actions).
export const NAV_ITEMS: { label: string; href: string; roles: Rol[] | null; principal?: boolean }[] = [
  { label: 'Dashboard',  href: '/dashboard',         roles: null, principal: true },
  { label: 'OTs',        href: '/ot',                roles: null, principal: true },
  { label: 'Fallas',     href: '/fallas',            roles: null, principal: true },
  { label: 'Equipos',    href: '/equipos',           roles: null, principal: true },
  { label: 'Mantención', href: '/mantenimiento',     roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO'] },
  { label: 'Horómetros', href: '/terreno/horometro', roles: null },
  { label: 'Bodega',     href: '/bodega',            roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'BODEGA', 'COMPRAS'] },
  { label: 'Reportes',   href: '/reportes',          roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'GERENCIA'] },
  { label: 'Compras',    href: '/compras',           roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER', 'COMPRAS'] },
  { label: 'Trabajadores', href: '/trabajadores',      roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'] },
  { label: 'Usuarios',    href: '/usuarios',          roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'] },
  { label: 'Faenas',      href: '/faenas',            roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'] },
  { label: 'Arriendos',   href: '/arriendos',         roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'GERENCIA'] },
  { label: 'Alertas', href: '/alertas', roles: null },
  { label: 'Compras directas', href: '/compras-directas', roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'COMPRAS'] },
  { label: 'Informes',    href: '/informes',          roles: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'GERENCIA'] },
]

export function navParaRol(rol: string): typeof NAV_ITEMS {
  return NAV_ITEMS.filter(item => !item.roles || (item.roles as string[]).includes(rol))
}
