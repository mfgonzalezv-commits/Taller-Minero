// Política de lecturas de horómetro/kilometraje (decisión de negocio). Lógica PURA.
//  - Lectura menor a la anterior: BLOQUEADA. Se corrige solo con la acción de corrección
//    (rol autorizado, motivo y auditoría).
//  - Salto anómalo: NO se usa hasta que un Jefe o Planificador lo confirme.
//  - Umbral inicial: el existente (3 unidades por hora real). Queda parametrizable para
//    configurarlo a futuro por faena o equipo.
export const UMBRAL_SALTO_POR_HORA_DEFECTO = 3

export type ResultadoLectura =
  | { tipo: 'OK' }
  | { tipo: 'MENOR'; mensaje: string }
  | { tipo: 'SALTO'; mensaje: string }

export function evaluarLectura(p: {
  valorNuevo: number
  valorAnterior: number | null
  fechaAnterior: Date | null
  unidad: 'horómetro' | 'kilometraje'
  ahora?: Date
  umbralPorHora?: number
}): ResultadoLectura {
  if (p.valorAnterior === null) return { tipo: 'OK' }
  if (p.valorNuevo < p.valorAnterior) {
    return { tipo: 'MENOR', mensaje: `Lectura de ${p.unidad} menor a la anterior (${p.valorAnterior} → ${p.valorNuevo}). Para corregir un error usa la corrección con motivo.` }
  }
  if (p.fechaAnterior) {
    const ahora = (p.ahora ?? new Date()).getTime()
    const horas = Math.max(0.1, (ahora - p.fechaAnterior.getTime()) / 3_600_000)
    const maxPlausible = p.valorAnterior + horas * (p.umbralPorHora ?? UMBRAL_SALTO_POR_HORA_DEFECTO)
    if (p.valorNuevo > maxPlausible) {
      return { tipo: 'SALTO', mensaje: `Salto anormal de ${p.unidad}: +${(p.valorNuevo - p.valorAnterior).toFixed(1)} en ${horas.toFixed(1)}h` }
    }
  }
  return { tipo: 'OK' }
}
