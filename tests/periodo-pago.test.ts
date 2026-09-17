import { describe, it, expect } from 'vitest'
import { calcularPeriodo } from '@/lib/periodo-pago'

describe('calcularPeriodo (Estado de Pago: día 26 a 25)', () => {
  it('una fecha antes del 26 pertenece al periodo que empezó el 26 del mes anterior', () => {
    const { inicio, termino } = calcularPeriodo(new Date(2026, 2, 10)) // 10 de marzo
    expect(inicio).toEqual(new Date(2026, 1, 26)) // 26 de febrero
    expect(termino.getFullYear()).toBe(2026)
    expect(termino.getMonth()).toBe(2) // marzo
    expect(termino.getDate()).toBe(25)
  })

  it('el día 26 exacto abre un periodo nuevo que empieza ese mismo día', () => {
    const { inicio } = calcularPeriodo(new Date(2026, 2, 26))
    expect(inicio).toEqual(new Date(2026, 2, 26))
  })

  it('una fecha después del 26 sigue perteneciendo al periodo que ya empezó', () => {
    const { inicio, termino } = calcularPeriodo(new Date(2026, 2, 30))
    expect(inicio).toEqual(new Date(2026, 2, 26))
    expect(termino.getMonth()).toBe(3) // abril
    expect(termino.getDate()).toBe(25)
  })

  it('el periodo cruza correctamente el cambio de año (diciembre → enero)', () => {
    const { inicio, termino } = calcularPeriodo(new Date(2026, 11, 30)) // 30 de diciembre
    expect(inicio).toEqual(new Date(2026, 11, 26))
    expect(termino.getFullYear()).toBe(2027)
    expect(termino.getMonth()).toBe(0) // enero
    expect(termino.getDate()).toBe(25)
  })

  it('el termino siempre es exactamente un mes después del inicio, día 25', () => {
    for (let mes = 0; mes < 12; mes++) {
      const { inicio, termino } = calcularPeriodo(new Date(2026, mes, 26))
      expect(termino.getDate()).toBe(25)
      expect(termino.getMonth()).toBe((inicio.getMonth() + 1) % 12)
    }
  })
})
