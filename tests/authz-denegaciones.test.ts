import { describe, expect, it, vi } from 'vitest'

const creados: unknown[] = []
vi.mock('@/lib/auth', () => ({ auth: async () => null }))
vi.mock('@/lib/prisma', () => ({ prisma: { registroAuditoria: { create: (a: unknown) => { creados.push(a); return Promise.reject(new Error('BD caída')) } } } }))

import { requireRolPermitido, requireAlcanceFaena, ErrorAutorizacion, _permitirRegistroDenegacion } from '../src/lib/authz'

const ses = { userId: 'u-1', rol: 'OPERADOR' as const, faenaId: 'f-1' }

describe('registro de permisos denegados', () => {
  it('una denegación por rol se registra y sigue lanzando el mismo error, aunque falle el registro', () => {
    expect(() => requireRolPermitido(ses, ['ADMINISTRADOR'])).toThrow(ErrorAutorizacion)
    expect(() => requireRolPermitido(ses, ['ADMINISTRADOR'])).toThrow('Sin permisos para esta acción')
    expect(creados.length).toBeGreaterThanOrEqual(1)
    const dato = (creados[0] as { data: { accion: string; entidad: string; valorNuevo: { tipo: string } } }).data
    expect(dato).toMatchObject({ accion: 'DENEGADO', entidad: 'Permiso' })
    expect(dato.valorNuevo.tipo).toBe('ROL')
  })
  it('una denegación por faena se registra', () => {
    expect(() => requireAlcanceFaena(ses, 'f-otra')).toThrow(/otra faena/)
    expect(creados.some(c => (c as { data: { valorNuevo: { tipo: string } } }).data.valorNuevo.tipo === 'FAENA')).toBe(true)
  })
  it('lo permitido no registra nada', () => {
    const antes = creados.length
    requireRolPermitido(ses, ['OPERADOR']); requireAlcanceFaena(ses, 'f-1')
    expect(creados.length).toBe(antes)
  })
  it('tope por usuario y minuto: no se inunda la tabla', () => {
    const t0 = 1_000_000
    const resultados = Array.from({ length: 30 }, () => _permitirRegistroDenegacion('u-flood', t0))
    expect(resultados.filter(Boolean).length).toBe(20)
    expect(_permitirRegistroDenegacion('u-flood', t0 + 61_000)).toBe(true)
  })
})
