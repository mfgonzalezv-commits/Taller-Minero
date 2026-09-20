import { describe, expect, it } from 'vitest'
import { puedeTransicionarSR, TRANSICIONES_SR, ESTADOS_TERMINALES_SR } from '../src/lib/maquina-sr'
import { LIMITE_COMPRA_DIRECTA_FAENA, requiereAprobacionCentral, validarRegularizacion } from '../src/lib/compra-directa'

describe('máquina de estados de la SR', () => {
  it('avanza por la secuencia existente', () => {
    const camino = ['BORRADOR', 'ENVIADA', 'EN_BODEGA_CENTRAL', 'EN_ADQUISICIONES', 'ESPERANDO_LLEGADA', 'RECIBIDA_FAENA', 'ENTREGADA']
    for (let i = 0; i < camino.length - 1; i++) expect(puedeTransicionarSR(camino[i], camino[i + 1])).toBe(true)
  })
  it('ENTREGADA y RECHAZADA (cancelación) son terminales (AUD-014)', () => {
    for (const t of ESTADOS_TERMINALES_SR) expect(TRANSICIONES_SR[t]).toEqual([])
    expect(puedeTransicionarSR('ENTREGADA', 'ENVIADA')).toBe(false)
    expect(puedeTransicionarSR('ENTREGADA', 'ENTREGADA')).toBe(false)
  })
  it('no hay retrocesos ni saltos a la entrega desde la gestión de compras', () => {
    expect(puedeTransicionarSR('EN_ADQUISICIONES', 'ENTREGADA')).toBe(false)
    expect(puedeTransicionarSR('RECIBIDA_FAENA', 'ENVIADA')).toBe(false)
  })
})

describe('compra directa', () => {
  const ok = { cotizaciones: ['COT-1'], comprobante: 'BOL-123', motivo: 'Emergencia de faena', monto: 100_000 }
  it('regularizar exige comprobante, motivo y al menos una cotización', () => {
    expect(validarRegularizacion(ok)).toBeNull()
    expect(validarRegularizacion({ ...ok, comprobante: ' ' })).toMatch(/comprobante/)
    expect(validarRegularizacion({ ...ok, motivo: '' })).toMatch(/motivo/)
    expect(validarRegularizacion({ ...ok, cotizaciones: [] })).toMatch(/cotización/)
    expect(validarRegularizacion({ ...ok, cotizaciones: ['  '] })).toMatch(/cotización/)
    expect(validarRegularizacion({ ...ok, monto: -1 })).toMatch(/monto/)
  })
  it('sobre el límite de faena requiere aprobación central', () => {
    expect(requiereAprobacionCentral(LIMITE_COMPRA_DIRECTA_FAENA - 1)).toBe(false)
    expect(requiereAprobacionCentral(LIMITE_COMPRA_DIRECTA_FAENA)).toBe(true)
  })
})
