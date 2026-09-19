// Máquina de estados del Estado de Pago (decisión de negocio):
// PREPARADO → APROBADO | RECHAZADO. APROBADO y RECHAZADO son terminales.
// La anulación de documentos aprobados NO está implementada (procedimiento futuro
// con motivo, documento reemplazante y auditoría).
export type EstadoEP = 'BORRADOR' | 'PREPARADO' | 'APROBADO' | 'RECHAZADO'

const TRANSICIONES: Record<EstadoEP, EstadoEP[]> = {
  BORRADOR: ['PREPARADO'],
  PREPARADO: ['APROBADO', 'RECHAZADO'],
  APROBADO: [],
  RECHAZADO: [],
}

export function puedeTransicionarEP(actual: EstadoEP, destino: EstadoEP): boolean {
  return TRANSICIONES[actual].includes(destino)
}

/** Solo un EP PREPARADO admite ajustes manuales. */
export function admiteAjustes(actual: EstadoEP): boolean {
  return actual === 'PREPARADO' || actual === 'BORRADOR'
}
