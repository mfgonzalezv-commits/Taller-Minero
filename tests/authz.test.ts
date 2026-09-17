import { describe, it, expect } from 'vitest'
import { requireRolPermitido, requireAlcanceFaena, ErrorAutorizacion, ROLES_ALCANCE_CENTRAL } from '@/lib/authz-core'
import type { SesionAutenticada } from '@/lib/authz-core'

function sesion(rol: SesionAutenticada['rol'], faenaId = 'faena-1'): SesionAutenticada {
  return { userId: 'user-1', rol, faenaId }
}

describe('authz: requireRolPermitido (RBAC)', () => {
  it('permite cuando el rol de la sesión está en la lista permitida', () => {
    expect(() => requireRolPermitido(sesion('JEFE_TALLER'), ['ADMINISTRADOR', 'JEFE_TALLER'])).not.toThrow()
  })

  it('rechaza cuando el rol de la sesión no está permitido', () => {
    expect(() => requireRolPermitido(sesion('MECANICO'), ['ADMINISTRADOR', 'JEFE_TALLER'])).toThrow(ErrorAutorizacion)
  })

  it('rechaza a un rol arbitrario que no aparece en la lista', () => {
    expect(() => requireRolPermitido(sesion('BODEGA'), ['COMPRAS'])).toThrow(ErrorAutorizacion)
  })
})

describe('authz: requireAlcanceFaena (aislamiento multi-faena)', () => {
  it('permite cuando el registro pertenece a la misma faena de la sesión', () => {
    expect(() => requireAlcanceFaena(sesion('JEFE_TALLER', 'faena-1'), 'faena-1')).not.toThrow()
  })

  it('rechaza cuando el registro pertenece a otra faena', () => {
    expect(() => requireAlcanceFaena(sesion('JEFE_TALLER', 'faena-1'), 'faena-2')).toThrow(ErrorAutorizacion)
  })

  it('rechaza cuando un MECANICO intenta acceder a un registro de otra faena', () => {
    expect(() => requireAlcanceFaena(sesion('MECANICO', 'faena-1'), 'faena-2')).toThrow(ErrorAutorizacion)
  })

  it('permite a un rol con alcance central acceder a cualquier faena', () => {
    for (const rolCentral of ROLES_ALCANCE_CENTRAL) {
      expect(() => requireAlcanceFaena(sesion(rolCentral, 'faena-1'), 'faena-2')).not.toThrow()
    }
  })

  it('un rol sin alcance central sigue restringido a su propia faena', () => {
    const rolesNoCentrales = (['JEFE_TALLER', 'PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'GERENCIA'] as const)
      .filter(r => !(ROLES_ALCANCE_CENTRAL as readonly string[]).includes(r))
    for (const rol of rolesNoCentrales) {
      expect(() => requireAlcanceFaena(sesion(rol, 'faena-1'), 'faena-2')).toThrow(ErrorAutorizacion)
    }
  })
})
