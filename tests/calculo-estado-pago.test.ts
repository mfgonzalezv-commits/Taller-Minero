import { describe, it, expect } from 'vitest'
import { calcularLineaArriendo } from '@/lib/calculo-estado-pago'

const TARIFA_MES = 3_000_000

describe('calcularLineaArriendo — modalidad MES, periodo COMPLETO (28, 29, 30, 31 días)', () => {
  // Un periodo completo (el equipo estuvo asignado los 30-31 días del
  // periodo) siempre cobra la tarifa mensual exacta — sea cual sea la
  // política, y sin importar si el mes calendario tuvo 28, 29, 30 o 31 días.
  // Esto es lo que se rompía antes: el código viejo dividía por un 30 fijo
  // incluso en periodos completos, sobrecobrando meses de 31 días.
  for (const dias of [28, 29, 30, 31]) {
    it(`DIAS_REALES, periodo de ${dias} días completo: bruto = tarifa exacta`, () => {
      const r = calcularLineaArriendo({
        modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'DIAS_REALES',
        diasPeriodo: dias, diasVigentes: dias,
        horasTrabajadas: 0, horasDetencion: 0, porcentajeDescuentoDetencion: 0,
      })
      expect(r.montoBruto).toBeCloseTo(TARIFA_MES, 2)
    })

    it(`BASE_30, periodo de ${dias} días completo: bruto = tarifa exacta`, () => {
      const r = calcularLineaArriendo({
        modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'BASE_30',
        diasPeriodo: dias, diasVigentes: dias,
        horasTrabajadas: 0, horasDetencion: 0, porcentajeDescuentoDetencion: 0,
      })
      expect(r.montoBruto).toBe(TARIFA_MES)
    })
  }
})

describe('calcularLineaArriendo — modalidad MES, periodo PARCIAL (las políticas divergen)', () => {
  it('DIAS_REALES prorratea contra los días reales del periodo (31 días, 15 vigentes)', () => {
    const r = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'DIAS_REALES',
      diasPeriodo: 31, diasVigentes: 15,
      horasTrabajadas: 0, horasDetencion: 0, porcentajeDescuentoDetencion: 0,
    })
    expect(r.montoBruto).toBeCloseTo(TARIFA_MES * (15 / 31), 2) // ≈ 1.451.613
  })

  it('BASE_30 prorratea contra una base fija de 30 días (31 días, 15 vigentes)', () => {
    const r = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'BASE_30',
      diasPeriodo: 31, diasVigentes: 15,
      horasTrabajadas: 0, horasDetencion: 0, porcentajeDescuentoDetencion: 0,
    })
    expect(r.montoBruto).toBe(TARIFA_MES * (15 / 30)) // = 1.500.000, distinto de DIAS_REALES
  })

  it('para un periodo de 28 días (febrero), las dos políticas también divergen en parcial', () => {
    const dias = 28
    const realesD = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'DIAS_REALES',
      diasPeriodo: dias, diasVigentes: 10, horasTrabajadas: 0, horasDetencion: 0, porcentajeDescuentoDetencion: 0,
    })
    const base30 = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'BASE_30',
      diasPeriodo: dias, diasVigentes: 10, horasTrabajadas: 0, horasDetencion: 0, porcentajeDescuentoDetencion: 0,
    })
    expect(realesD.montoBruto).toBeCloseTo(TARIFA_MES * (10 / 28), 2)
    expect(base30.montoBruto).toBe(TARIFA_MES * (10 / 30))
    expect(realesD.montoBruto).not.toBeCloseTo(base30.montoBruto, 0)
  })
})

describe('calcularLineaArriendo — descuento por detención (parcial y total)', () => {
  it('BASE_30, periodo de 30 días, 48h detenidas al 100%: neto = bruto - 200.000', () => {
    const r = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'BASE_30',
      diasPeriodo: 30, diasVigentes: 30,
      horasTrabajadas: 0, horasDetencion: 48, porcentajeDescuentoDetencion: 100,
    })
    // tarifa diaria = 3.000.000/30 = 100.000; hora equivalente = 4.166,67
    // descuento = 48 × 4.166,67 × 100% = 200.000
    expect(r.montoBruto).toBe(3_000_000)
    expect(r.descuentoDetencion).toBeCloseTo(200_000, 0)
    expect(r.montoNeto).toBeCloseTo(2_800_000, 0)
  })

  it('DIAS_REALES, periodo de 31 días, 48h detenidas al 100%: descuento distinto a BASE_30 para el mismo caso', () => {
    const r = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'DIAS_REALES',
      diasPeriodo: 31, diasVigentes: 31,
      horasTrabajadas: 0, horasDetencion: 48, porcentajeDescuentoDetencion: 100,
    })
    // tarifa diaria = 3.000.000/31 = 96.774,19; hora equivalente = 4.032,26
    // descuento = 48 × 4.032,26 × 100% ≈ 193.548
    expect(r.montoBruto).toBe(3_000_000)
    expect(r.descuentoDetencion).toBeCloseTo(193_548.4, 1)
    expect(r.montoNeto).toBeCloseTo(2_806_451.6, 1)
  })

  it('descuento parcial (50%): la mitad del cálculo al 100%', () => {
    const r100 = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'BASE_30',
      diasPeriodo: 30, diasVigentes: 30,
      horasTrabajadas: 0, horasDetencion: 48, porcentajeDescuentoDetencion: 100,
    })
    const r50 = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'BASE_30',
      diasPeriodo: 30, diasVigentes: 30,
      horasTrabajadas: 0, horasDetencion: 48, porcentajeDescuentoDetencion: 50,
    })
    expect(r50.descuentoDetencion).toBeCloseTo(r100.descuentoDetencion / 2, 2)
  })

  it('sin regla de descuento configurada (0%): no descuenta nada, aunque haya horas detenidas', () => {
    const r = calcularLineaArriendo({
      modalidad: 'MES', tarifa: TARIFA_MES, politicaProrateo: 'BASE_30',
      diasPeriodo: 30, diasVigentes: 30,
      horasTrabajadas: 0, horasDetencion: 48, porcentajeDescuentoDetencion: 0,
    })
    expect(r.descuentoDetencion).toBe(0)
    expect(r.montoNeto).toBe(r.montoBruto)
  })
})

describe('calcularLineaArriendo — modalidad HORA (no depende de la política de prorrateo)', () => {
  it('cobra exactamente horas trabajadas × tarifa, sin descuento por detención', () => {
    const r = calcularLineaArriendo({
      modalidad: 'HORA', tarifa: 10_000, politicaProrateo: 'DIAS_REALES',
      diasPeriodo: 31, diasVigentes: 31,
      horasTrabajadas: 250, horasDetencion: 999, porcentajeDescuentoDetencion: 100,
    })
    expect(r.montoBruto).toBe(2_500_000)
    expect(r.descuentoDetencion).toBe(0) // el horómetro ya excluye el tiempo detenido
    expect(r.montoNeto).toBe(2_500_000)
  })
})

describe('calcularLineaArriendo — modalidad DIA', () => {
  it('cobra tarifa × días vigentes, con descuento por detención si corresponde', () => {
    const r = calcularLineaArriendo({
      modalidad: 'DIA', tarifa: 50_000, politicaProrateo: 'DIAS_REALES',
      diasPeriodo: 31, diasVigentes: 20,
      horasTrabajadas: 0, horasDetencion: 24, porcentajeDescuentoDetencion: 100,
    })
    expect(r.montoBruto).toBe(1_000_000) // 20 × 50.000
    expect(r.descuentoDetencion).toBeCloseTo(50_000, 2) // 24h × (50.000/24) × 100%
    expect(r.montoNeto).toBeCloseTo(950_000, 2)
  })
})
