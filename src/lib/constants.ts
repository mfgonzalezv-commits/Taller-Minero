export const ESTADO_OT_CONFIG = {
  PROGRAMADA:      { label: 'Programada',     color: 'bg-indigo-900/60 text-indigo-300',  dot: 'bg-indigo-400' },
  ABIERTA:         { label: 'Abierta',        color: 'bg-gray-700/60 text-gray-300',      dot: 'bg-gray-400' },
  EN_DIAGNOSTICO:  { label: 'En diagnóstico',  color: 'bg-blue-900/60 text-blue-300',      dot: 'bg-blue-400' },
  DIAGNOSTICADO:        { label: 'Diagnosticado',      color: 'bg-cyan-900/60 text-cyan-300',        dot: 'bg-cyan-400' },
  REPARACION_PROGRAMADA:{ label: 'Rep. programada',    color: 'bg-violet-900/60 text-violet-300',    dot: 'bg-violet-400' },
  LISTO_PARA_REPARAR:   { label: 'Listo p/ reparar',  color: 'bg-teal-900/60 text-teal-300',        dot: 'bg-teal-400' },
  EN_REPARACION:        { label: 'En reparación',      color: 'bg-yellow-900/60 text-yellow-300',    dot: 'bg-yellow-400' },
  ESPERA_REPUESTO: { label: 'Esp. repuesto',  color: 'bg-orange-900/60 text-orange-300',  dot: 'bg-orange-400' },
  EN_VALIDACION:   { label: 'En validación',  color: 'bg-purple-900/60 text-purple-300',  dot: 'bg-purple-400' },
  CERRADA:         { label: 'Cerrada',        color: 'bg-green-900/60 text-green-300',    dot: 'bg-green-400' },
} as const

export const ESTADO_EQUIPO_CONFIG = {
  OPERATIVO:         { label: 'Operativo',         color: 'bg-green-900/60 text-green-300' },
  DETENIDO:          { label: 'Detenido',           color: 'bg-red-900/60 text-red-300' },
  TALLER:            { label: 'En taller',          color: 'bg-yellow-900/60 text-yellow-300' },
  FUERA_DE_SERVICIO: { label: 'Fuera de servicio',  color: 'bg-gray-700/60 text-gray-400' },
} as const

export const PRIORIDAD_CONFIG = {
  BAJA:    { label: 'Baja',    color: 'bg-gray-700/60 text-gray-300',    orden: 4 },
  MEDIA:   { label: 'Media',   color: 'bg-blue-900/60 text-blue-300',    orden: 3 },
  ALTA:    { label: 'Alta',    color: 'bg-orange-900/60 text-orange-300', orden: 2 },
  CRITICA: { label: 'Crítica', color: 'bg-red-900/60 text-red-300',      orden: 1 },
} as const

export const TRANSICIONES_OT: Record<string, string[]> = {
  PROGRAMADA: ['ABIERTA'],
  ABIERTA: ['CERRADA'],
  EN_DIAGNOSTICO: ['DIAGNOSTICADO', 'CERRADA'],
  DIAGNOSTICADO:         ['EN_REPARACION', 'REPARACION_PROGRAMADA', 'ESPERA_REPUESTO'],
  REPARACION_PROGRAMADA: ['EN_REPARACION', 'LISTO_PARA_REPARAR'],
  LISTO_PARA_REPARAR:    ['EN_REPARACION', 'REPARACION_PROGRAMADA'],
  EN_REPARACION:         ['ESPERA_REPUESTO', 'EN_VALIDACION'],
  ESPERA_REPUESTO:       ['LISTO_PARA_REPARAR'],
  EN_VALIDACION: ['CERRADA', 'EN_REPARACION'],
  CERRADA: ['ABIERTA'],
}

export const RESPONSABLE_POR_ESTADO: Record<string, string | null> = {
  ABIERTA: 'JEFE_TALLER',
  EN_DIAGNOSTICO: 'MECANICO',
  DIAGNOSTICADO: 'JEFE_TALLER',
  REPARACION_PROGRAMADA: 'PLANIFICADOR',
  EN_REPARACION: 'MECANICO',
  ESPERA_REPUESTO: 'BODEGA',
  EN_VALIDACION: 'JEFE_TALLER',
  CERRADA: null,
}

export const BRAND = {
  primary: '#1B3A5C',
  secondary: '#2E6DA4',
  light: '#D6E8F7',
}
