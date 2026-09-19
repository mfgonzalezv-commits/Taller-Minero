// Cálculo puro de UNA línea de Estado de Pago para una asignación (arriendo).
// prepararEstadoPago() consulta los datos y delega acá; así la regla se prueba
// sin base de datos.
import { calcularLineaArriendo, type ModalidadArriendo, type PoliticaProrateo } from './calculo-estado-pago'
import { deltaHorometroEnVentana, minutosDetencionUnicos, ventanaEfectiva, type LecturaHorometro, type OtDetencion, type Ventana } from './detencion-periodo'

const DIA_MS = 86_400_000

export interface AsignacionArriendo {
  id: string
  equipoId: string
  faenaId: string
  fechaInicio: Date
  fechaTermino: Date | null
  modalidad: ModalidadArriendo
  tarifa: number
  politicaProrateo: PoliticaProrateo
  reglaDescuentoDetencion: string | null
}

export interface LineaCalculada {
  equipoId: string
  asignacionId: string
  modalidad: ModalidadArriendo
  tarifa: number
  cantidadUnidades: number
  montoBruto: number
  horasDetencion: number
  descuentoDetencion: number
  montoNeto: number
}

export function calcularLineaAsignacion(a: AsignacionArriendo, periodo: Ventana, ots: OtDetencion[], lecturas: LecturaHorometro[]): LineaCalculada {
  const ctx = { equipoId: a.equipoId, faenaId: a.faenaId }
  const diasPeriodo = Math.round((periodo.termino.getTime() - periodo.inicio.getTime()) / DIA_MS)
  const diasVigentes = Math.min(
    diasPeriodo,
    Math.round(((a.fechaTermino ?? periodo.termino).getTime() - Math.max(a.fechaInicio.getTime(), periodo.inicio.getTime())) / DIA_MS)
  )
  const v = ventanaEfectiva(periodo, a)
  const horasDetencion = v ? minutosDetencionUnicos(ots, ctx, v) / 60 : 0
  const horasTrabajadas = v && a.modalidad === 'HORA' ? deltaHorometroEnVentana(lecturas, ctx, v) : 0
  const porcentajeDescuentoDetencion = a.reglaDescuentoDetencion ? parseFloat(a.reglaDescuentoDetencion.replace('%', '')) || 0 : 0

  // En HORA la detención se registra como información: calcularLineaArriendo no
  // descuenta porque el horómetro ya excluye el tiempo detenido.
  const r = calcularLineaArriendo({
    modalidad: a.modalidad, tarifa: a.tarifa, politicaProrateo: a.politicaProrateo,
    diasPeriodo, diasVigentes, horasTrabajadas, horasDetencion, porcentajeDescuentoDetencion,
  })
  return {
    equipoId: a.equipoId, asignacionId: a.id, modalidad: a.modalidad, tarifa: a.tarifa,
    cantidadUnidades: r.cantidadUnidades, montoBruto: r.montoBruto, horasDetencion,
    descuentoDetencion: r.descuentoDetencion, montoNeto: r.montoNeto,
  }
}
