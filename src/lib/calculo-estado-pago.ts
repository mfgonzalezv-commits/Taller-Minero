// Cálculo puro de una línea de Estado de Pago (arriendo). Sin Prisma, sin
// Next — testeable de forma aislada y llamable directo desde un script para
// obtener el resultado crudo de la función (sin cálculo manual aparte).
//
// Política de prorrateo (solo aplica a modalidad MES, configurable por
// contrato en AsignacionEquipoFaena.politicaProrateo):
//   - DIAS_REALES: el mes vale más o menos según los días calendario reales
//     del periodo de facturación (28 a 31). La tarifa diaria implícita es
//     tarifa / diasPeriodo.
//   - BASE_30: un periodo completo siempre cobra la tarifa exacta, sin
//     importar si el mes calendario tuvo 28-31 días. La tarifa diaria
//     implícita para prorratear periodos PARCIALES (el equipo entró o salió
//     a mitad de mes) usa 30 como base comercial fija.
// En ambas políticas, el descuento por detención usa la MISMA tarifa diaria
// implícita que se usó para calcular el bruto — para que bruto y descuento
// queden siempre coherentes entre sí.

export type ModalidadArriendo = 'HORA' | 'DIA' | 'MES'
export type PoliticaProrateo = 'DIAS_REALES' | 'BASE_30'

export interface CalculoLineaArriendoInput {
  modalidad: ModalidadArriendo
  tarifa: number
  politicaProrateo: PoliticaProrateo
  /** Días calendario reales del periodo de facturación completo (28-31). */
  diasPeriodo: number
  /** Días dentro del periodo en que la asignación estuvo vigente (<= diasPeriodo). Solo relevante para DIA/MES. */
  diasVigentes: number
  /** Solo relevante para modalidad HORA: delta de horómetro en el periodo. */
  horasTrabajadas: number
  /** Horas de detención reales dentro del periodo (de OT del equipo). */
  horasDetencion: number
  /** 0-100. Ya resuelto desde AsignacionEquipoFaena.reglaDescuentoDetencion (ej. "100%" -> 100). */
  porcentajeDescuentoDetencion: number
}

export interface CalculoLineaArriendoResultado {
  cantidadUnidades: number
  tarifaDiariaImplicita: number
  montoBruto: number
  descuentoDetencion: number
  montoNeto: number
}

function tarifaDiariaImplicita(input: CalculoLineaArriendoInput): number {
  if (input.modalidad === 'HORA') return 0 // no aplica: se factura por hora, no por día
  if (input.modalidad === 'DIA') return input.tarifa
  // MES
  const diasBase = input.politicaProrateo === 'BASE_30' ? 30 : input.diasPeriodo
  return diasBase > 0 ? input.tarifa / diasBase : 0
}

export function calcularLineaArriendo(input: CalculoLineaArriendoInput): CalculoLineaArriendoResultado {
  let cantidadUnidades = 0
  let montoBruto = 0
  const diaria = tarifaDiariaImplicita(input)

  if (input.modalidad === 'HORA') {
    cantidadUnidades = input.horasTrabajadas
    montoBruto = cantidadUnidades * input.tarifa
  } else if (input.modalidad === 'DIA') {
    cantidadUnidades = input.diasVigentes
    montoBruto = cantidadUnidades * diaria
  } else {
    // MES
    cantidadUnidades = input.diasPeriodo > 0 ? input.diasVigentes / input.diasPeriodo : 0
    montoBruto =
      input.politicaProrateo === 'BASE_30' && input.diasVigentes >= input.diasPeriodo
        ? input.tarifa // periodo completo: tarifa exacta, sin importar días reales del mes
        : diaria * input.diasVigentes
  }

  const tarifaHoraEquivalente = diaria / 24
  const descuentoDetencion =
    input.modalidad === 'HORA'
      ? 0 // el horómetro no avanza detenido: ya está excluido del bruto
      : input.horasDetencion * tarifaHoraEquivalente * (input.porcentajeDescuentoDetencion / 100)

  const montoNeto = Math.max(0, montoBruto - descuentoDetencion)

  return { cantidadUnidades, tarifaDiariaImplicita: diaria, montoBruto, descuentoDetencion, montoNeto }
}
