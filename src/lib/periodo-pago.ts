// Periodo de facturación del taller: día 26 al 25 del mes siguiente.
// Lógica pura, sin dependencias de Prisma/Next, para poder testearla aislada
// (es cálculo financiero — un error de un día corre todo el Estado de Pago).
export function calcularPeriodo(fechaBase: Date): { inicio: Date; termino: Date } {
  const dia = fechaBase.getDate()
  const inicio = new Date(fechaBase.getFullYear(), fechaBase.getMonth() - (dia < 26 ? 1 : 0), 26)
  const termino = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 25, 23, 59, 59)
  return { inicio, termino }
}
