import { describe, expect, it } from 'vitest'
import { rolesAdministrables, validarGestionUsuario, ROLES_ASIGNAR_TECNICO, ROLES_CREAR_OT, ROLES_AUTORIZAR_REPUESTO, ROLES_CREAR_ITEM_BODEGA, ROLES_CREAR_PLAN, ROLES_BITACORA } from '../src/lib/permisos-roles'
import { admiteAjustes, puedeTransicionarEP } from '../src/lib/estado-pago-maquina'
import type { Rol } from '../src/lib/roles'

const TODOS: Rol[] = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'GERENCIA', 'OPERADOR']
const CENTRALES_Y_GERENCIA = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'GERENCIA']

describe('matriz de roles definitiva', () => {
  it('asignar técnico, crear OT, autorizar repuesto y crear plan: administración y planificación, nunca operación', () => {
    for (const lista of [ROLES_ASIGNAR_TECNICO, ROLES_CREAR_OT, ROLES_AUTORIZAR_REPUESTO, ROLES_CREAR_PLAN]) {
      expect([...lista].sort()).toEqual(['ADMINISTRADOR', 'JEFE_TALLER', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR', 'PLANIFICADOR_CENTRAL'])
      for (const r of ['OPERADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'GERENCIA'] as Rol[]) expect(lista).not.toContain(r)
    }
  })
  it('bitácora/diagnóstico suma al MECANICO (la asignación se valida en la acción)', () => {
    expect(ROLES_BITACORA).toContain('MECANICO')
    expect(ROLES_BITACORA).not.toContain('OPERADOR')
  })
  it('maestro de bodega: solo ADMINISTRADOR y BODEGA', () => {
    expect([...ROLES_CREAR_ITEM_BODEGA].sort()).toEqual(['ADMINISTRADOR', 'BODEGA'])
  })
})

describe('administración de usuarios', () => {
  it('solo ADMINISTRADOR otorga ADMINISTRADOR, roles centrales y GERENCIA', () => {
    for (const rol of TODOS) {
      const puede = rolesAdministrables(rol)
      for (const c of CENTRALES_Y_GERENCIA) expect(puede.includes(c as Rol)).toBe(rol === 'ADMINISTRADOR')
    }
  })
  it('JEFE_TALLER administra solo PLANIFICADOR, MECANICO, BODEGA, COMPRAS y OPERADOR', () => {
    expect([...rolesAdministrables('JEFE_TALLER')].sort()).toEqual(['BODEGA', 'COMPRAS', 'MECANICO', 'OPERADOR', 'PLANIFICADOR'])
  })
  it('JEFE_TALLER_CENTRAL administra únicamente roles de faena', () => {
    const p = rolesAdministrables('JEFE_TALLER_CENTRAL')
    expect(p).toContain('JEFE_TALLER')
    for (const c of CENTRALES_Y_GERENCIA) expect(p).not.toContain(c)
  })
  it('los demás roles no administran usuarios', () => {
    for (const r of ['PLANIFICADOR_CENTRAL', 'PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'GERENCIA', 'OPERADOR'] as Rol[]) expect(rolesAdministrables(r)).toEqual([])
  })
  it('un JEFE_TALLER no crea ADMINISTRADOR ni roles centrales (AUD-001)', () => {
    for (const rolNuevo of ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'GERENCIA', 'JEFE_TALLER'] as Rol[])
      expect(validarGestionUsuario({ actorId: 'a', actorRol: 'JEFE_TALLER', rolNuevo })).not.toBeNull()
    expect(validarGestionUsuario({ actorId: 'a', actorRol: 'JEFE_TALLER', rolNuevo: 'MECANICO' })).toBeNull()
  })
  it('nadie eleva su propio rol', () => {
    expect(validarGestionUsuario({ actorId: 'a', actorRol: 'ADMINISTRADOR', objetivoId: 'a', objetivoRolActual: 'ADMINISTRADOR', rolNuevo: 'JEFE_TALLER' })).toMatch(/propio rol/)
  })
  it('un Jefe no modifica a otro Jefe ni a un administrador', () => {
    for (const actual of ['JEFE_TALLER', 'ADMINISTRADOR', 'JEFE_TALLER_CENTRAL'] as Rol[])
      expect(validarGestionUsuario({ actorId: 'a', actorRol: 'JEFE_TALLER', objetivoId: 'b', objetivoRolActual: actual })).not.toBeNull()
  })
  it('un rol central no puede bajar ni subir a un administrador', () => {
    expect(validarGestionUsuario({ actorId: 'a', actorRol: 'JEFE_TALLER_CENTRAL', objetivoId: 'b', objetivoRolActual: 'ADMINISTRADOR', rolNuevo: 'OPERADOR' })).not.toBeNull()
  })
})

describe('máquina de estados del Estado de Pago', () => {
  it('PREPARADO → APROBADO o RECHAZADO', () => {
    expect(puedeTransicionarEP('PREPARADO', 'APROBADO')).toBe(true)
    expect(puedeTransicionarEP('PREPARADO', 'RECHAZADO')).toBe(true)
  })
  it('APROBADO y RECHAZADO son terminales (AUD-003)', () => {
    for (const t of ['APROBADO', 'RECHAZADO'] as const)
      for (const d of ['PREPARADO', 'APROBADO', 'RECHAZADO'] as const) expect(puedeTransicionarEP(t, d)).toBe(false)
  })
  it('solo un EP preparado admite ajustes', () => {
    expect(admiteAjustes('PREPARADO')).toBe(true)
    expect(admiteAjustes('APROBADO')).toBe(false)
    expect(admiteAjustes('RECHAZADO')).toBe(false)
  })
})
