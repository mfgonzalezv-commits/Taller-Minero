// Máquina de estados de la Solicitud de Repuesto (SR). Lógica PURA.
// Solo avanza por la secuencia existente. ENTREGADA y RECHAZADA (la "cancelación") son terminales.
export type EstadoSRMaquina = 'BORRADOR' | 'ENVIADA' | 'EN_BODEGA_CENTRAL' | 'EN_ADQUISICIONES' | 'ESPERANDO_LLEGADA' | 'RECIBIDA_FAENA' | 'ENTREGADA' | 'RECHAZADA'

export const TRANSICIONES_SR: Record<EstadoSRMaquina, EstadoSRMaquina[]> = {
  BORRADOR: ['ENVIADA', 'RECHAZADA'],
  ENVIADA: ['ENTREGADA', 'EN_BODEGA_CENTRAL', 'RECIBIDA_FAENA', 'RECHAZADA'],
  EN_BODEGA_CENTRAL: ['EN_ADQUISICIONES', 'ESPERANDO_LLEGADA', 'RECHAZADA'],
  EN_ADQUISICIONES: ['ESPERANDO_LLEGADA', 'RECHAZADA'],
  ESPERANDO_LLEGADA: ['RECIBIDA_FAENA', 'RECHAZADA'],
  RECIBIDA_FAENA: ['ENTREGADA'],
  ENTREGADA: [],
  RECHAZADA: [],
}

export const ESTADOS_TERMINALES_SR: EstadoSRMaquina[] = ['ENTREGADA', 'RECHAZADA']

export function puedeTransicionarSR(actual: string, destino: string): boolean {
  return (TRANSICIONES_SR[actual as EstadoSRMaquina] ?? []).includes(destino as EstadoSRMaquina)
}
