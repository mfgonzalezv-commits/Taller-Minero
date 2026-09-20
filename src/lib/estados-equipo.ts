// Estados NO operacionales de un equipo: mientras esté en uno de ellos hay un episodio de detención abierto,
// que SOLO termina con la liberación operacional.
export const ESTADOS_NO_OPERACIONALES = ['DETENIDO', 'DETENIDO_PENDIENTE_VALIDACION', 'TALLER', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO'] as const
export const esNoOperacional = (estado: string): boolean => (ESTADOS_NO_OPERACIONALES as readonly string[]).includes(estado)
