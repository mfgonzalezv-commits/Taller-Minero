import { describe, expect, it } from 'vitest'
import { puedeTransicionarOT, validarTransicionOT, TRANSICIONES_OT } from '../src/lib/maquina-ot'
import { evaluarLectura } from '../src/lib/horometro-politica'

describe('máquina de estados de la OT', () => {
  it('camino feliz hasta el cierre pasa por EN_VALIDACION', () => {
    const camino = ['ABIERTA', 'EN_DIAGNOSTICO', 'DIAGNOSTICADO', 'EN_REPARACION', 'EN_VALIDACION', 'CERRADA']
    for (let i = 0; i < camino.length - 1; i++) expect(puedeTransicionarOT(camino[i], camino[i + 1])).toBe(true)
  })
  it('no se cierra sin pasar por EN_VALIDACION', () => {
    for (const desde of ['PROGRAMADA', 'ABIERTA', 'EN_DIAGNOSTICO', 'DIAGNOSTICADO', 'EN_REPARACION', 'ESPERA_REPUESTO', 'LISTO_PARA_REPARAR', 'REPARACION_PROGRAMADA'])
      expect(validarTransicionOT(desde, 'CERRADA', { validadaTecnicamente: true })).not.toBeNull()
  })
  it('EN_VALIDACION → CERRADA exige la validación técnica del Jefe', () => {
    expect(validarTransicionOT('EN_VALIDACION', 'CERRADA', { validadaTecnicamente: false })).toMatch(/validación técnica/)
    expect(validarTransicionOT('EN_VALIDACION', 'CERRADA', { validadaTecnicamente: true })).toBeNull()
  })
  it('EN_REPARACION → ABIERTA no existe (AUD-008)', () => {
    expect(validarTransicionOT('EN_REPARACION', 'ABIERTA', { validadaTecnicamente: false })).not.toBeNull()
  })
  it('una OT cerrada no cambia por cambiarEstadoOT: se reabre con la acción específica', () => {
    expect(TRANSICIONES_OT.CERRADA).toEqual([])
    expect(validarTransicionOT('CERRADA', 'ABIERTA', { validadaTecnicamente: true })).toMatch(/reapertura/)
  })
  it('anular tiene su acción propia', () => {
    expect(validarTransicionOT('ABIERTA', 'ANULADA', { validadaTecnicamente: false })).toMatch(/anulación/)
  })
  it('el retrabajo vuelve de EN_VALIDACION a EN_REPARACION', () => {
    expect(puedeTransicionarOT('EN_VALIDACION', 'EN_REPARACION')).toBe(true)
  })
})

describe('política de horómetro', () => {
  const ahora = new Date('2026-09-19T12:00:00Z')
  const hace10h = new Date('2026-09-19T02:00:00Z')
  it('primera lectura y avance normal pasan', () => {
    expect(evaluarLectura({ valorNuevo: 100, valorAnterior: null, fechaAnterior: null, unidad: 'horómetro', ahora }).tipo).toBe('OK')
    expect(evaluarLectura({ valorNuevo: 1008, valorAnterior: 1000, fechaAnterior: hace10h, unidad: 'horómetro', ahora }).tipo).toBe('OK')
  })
  it('lectura menor queda bloqueada', () => {
    expect(evaluarLectura({ valorNuevo: 999, valorAnterior: 1000, fechaAnterior: hace10h, unidad: 'horómetro', ahora }).tipo).toBe('MENOR')
  })
  it('salto sobre el umbral (3 por hora real) queda como SALTO', () => {
    expect(evaluarLectura({ valorNuevo: 1031, valorAnterior: 1000, fechaAnterior: hace10h, unidad: 'horómetro', ahora }).tipo).toBe('SALTO')
    expect(evaluarLectura({ valorNuevo: 1030, valorAnterior: 1000, fechaAnterior: hace10h, unidad: 'horómetro', ahora }).tipo).toBe('OK')
  })
  it('el umbral es parametrizable (futuro por faena o equipo)', () => {
    expect(evaluarLectura({ valorNuevo: 1031, valorAnterior: 1000, fechaAnterior: hace10h, unidad: 'horómetro', ahora, umbralPorHora: 4 }).tipo).toBe('OK')
  })
})
