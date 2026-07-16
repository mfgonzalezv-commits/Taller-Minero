export type Rol =
  | 'ADMINISTRADOR'
  | 'JEFE_TALLER'
  | 'PLANIFICADOR'
  | 'MECANICO'
  | 'BODEGA'
  | 'COMPRAS'
  | 'GERENCIA'

// Prefijos de ruta → roles que pueden acceder
const RUTAS_PROTEGIDAS: { prefijo: string; roles: Rol[] }[] = [
  { prefijo: '/usuarios',           roles: ['ADMINISTRADOR', 'JEFE_TALLER'] },
  { prefijo: '/equipos/nuevo',      roles: ['ADMINISTRADOR', 'JEFE_TALLER'] },
  { prefijo: '/reportes',           roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'GERENCIA'] },
  { prefijo: '/bodega',             roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'BODEGA', 'COMPRAS'] },
  { prefijo: '/mantenimiento',      roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO'] },
  { prefijo: '/compras',            roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'COMPRAS'] },
  { prefijo: '/trabajadores',       roles: ['ADMINISTRADOR', 'JEFE_TALLER'] },
]

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

// Items de nav con su control de acceso
export const NAV_ITEMS: { label: string; href: string; roles: Rol[] | null }[] = [
  { label: 'Dashboard',  href: '/dashboard',         roles: null },
  { label: 'OTs',        href: '/ot',                roles: null },
  { label: 'Equipos',    href: '/equipos',           roles: null },
  { label: 'Mantención', href: '/mantenimiento',     roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO'] },
  { label: 'Horómetros', href: '/terreno/horometro', roles: null },
  { label: 'Bodega',     href: '/bodega',            roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'BODEGA', 'COMPRAS'] },
  { label: 'Reportes',   href: '/reportes',          roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'GERENCIA'] },
  { label: 'Compras',    href: '/compras',           roles: ['ADMINISTRADOR', 'JEFE_TALLER', 'COMPRAS'] },
  { label: 'Trabajadores', href: '/trabajadores',      roles: ['ADMINISTRADOR', 'JEFE_TALLER'] },
  { label: 'Usuarios',    href: '/usuarios',          roles: ['ADMINISTRADOR', 'JEFE_TALLER'] },
]

export function navParaRol(rol: string): typeof NAV_ITEMS {
  return NAV_ITEMS.filter(item => !item.roles || (item.roles as string[]).includes(rol))
}
