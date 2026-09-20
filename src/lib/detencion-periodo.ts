// Dominio: detención de equipos dentro de un periodo de facturación.
// Lógica PURA (sin Prisma). La usan prepararEstadoPago() y el generador de la
// simulación SIM-01 — producción nunca importa desde la simulación.
//
// Regla: por equipo y asignación, cada OT genera una ventana de detención
// [fechaCreacion, fechaTerminoTrabajo] (si sigue abierta, hasta el límite
// efectivo del periodo). Las ventanas se recortan a la vigencia efectiva
// (periodo ∩ asignación) y se UNEN, de modo que cada minuto real detenido se
// cuenta una sola vez aunque haya OT simultáneas o contiguas.

export interface Intervalo { ini: Date; fin: Date }
export interface Ventana { inicio: Date; termino: Date }

export interface OtDetencion {
  equipoId: string
  faenaId: string
  estado: string
  fechaCreacion: Date
  fechaTerminoTrabajo: Date | null
  /** Respaldo: una OT cerrada directamente (sin pasar por EN_VALIDACION) no tiene fechaTerminoTrabajo. */
  fechaCierre?: Date | null
  /**
   * Episodios de detención ya calculados (ver episodiosDetencionOT). Si vienen, reemplazan a la ventana simple
   * [fechaCreacion, término técnico]: la detención termina en la LIBERACIÓN operacional y una reapertura abre otro episodio.
   */
  episodios?: { ini: Date; fin: Date | null }[]
}

export interface LecturaHorometro {
  equipoId: string
  faenaId: string
  fecha: Date
  horometro: number | null
}

export function recortarIntervalo(i: Intervalo, ini: Date, fin: Date): Intervalo | null {
  const a = Math.max(i.ini.getTime(), ini.getTime())
  const b = Math.min(i.fin.getTime(), fin.getTime())
  return b > a ? { ini: new Date(a), fin: new Date(b) } : null
}

/** Une intervalos que se superponen o son contiguos. */
export function unirIntervalos(is: Intervalo[]): Intervalo[] {
  const orden = [...is].sort((x, y) => x.ini.getTime() - y.ini.getTime())
  const out: Intervalo[] = []
  for (const i of orden) {
    const ult = out[out.length - 1]
    if (ult && i.ini.getTime() <= ult.fin.getTime()) {
      if (i.fin.getTime() > ult.fin.getTime()) ult.fin = new Date(i.fin.getTime())
    } else out.push({ ini: new Date(i.ini.getTime()), fin: new Date(i.fin.getTime()) })
  }
  return out
}

/** Minutos detenidos dentro de [ini, fin]: cada ventana se recorta y luego se unen. */
export function minutosDetencionEnPeriodo(ventanas: Intervalo[], ini: Date, fin: Date): number {
  const recortadas = ventanas.map(v => recortarIntervalo(v, ini, fin)).filter((x): x is Intervalo => x !== null)
  return unirIntervalos(recortadas).reduce((a, i) => a + (i.fin.getTime() - i.ini.getTime()) / 60_000, 0)
}

/** Ventana efectiva = periodo ∩ vigencia de la asignación. null si no se cruzan. */
export function ventanaEfectiva(periodo: Ventana, asignacion: { fechaInicio: Date; fechaTermino: Date | null }): Ventana | null {
  const inicio = new Date(Math.max(periodo.inicio.getTime(), asignacion.fechaInicio.getTime()))
  const termino = new Date(Math.min(periodo.termino.getTime(), asignacion.fechaTermino?.getTime() ?? periodo.termino.getTime()))
  return termino.getTime() > inicio.getTime() ? { inicio, termino } : null
}

/** Fin de la detención de la OT: término técnico; si no existe y la OT está CERRADA, su fecha de cierre; si no, null (sigue abierta). */
export function finDetencion(ot: OtDetencion): Date | null {
  return ot.fechaTerminoTrabajo ?? (ot.estado === 'CERRADA' ? ot.fechaCierre ?? null : null)
}

/** ¿Esta OT cuenta para la ventana? Mismo equipo, misma faena, no anulada y cruzada con la ventana. */
export function otAfectaVentana(ot: OtDetencion, ctx: { equipoId: string; faenaId: string }, v: Ventana): boolean {
  if (ot.equipoId !== ctx.equipoId || ot.faenaId !== ctx.faenaId) return false
  if (ot.estado === 'ANULADA') return false
  if (ot.episodios) return ot.episodios.some(e => e.ini.getTime() <= v.termino.getTime() && (e.fin === null || e.fin.getTime() >= v.inicio.getTime()))
  if (ot.fechaCreacion.getTime() > v.termino.getTime()) return false
  const fin = finDetencion(ot)
  return fin === null || fin.getTime() >= v.inicio.getTime()
}

/** Minutos reales (únicos) de detención de un equipo dentro de la ventana efectiva. */
export function minutosDetencionUnicos(ots: OtDetencion[], ctx: { equipoId: string; faenaId: string }, v: Ventana): number {
  // Cada OT aporta uno o más episodios; los abiertos (sin liberación) llegan hasta el límite efectivo. Todo se une para no contar dos veces.
  const ventanas = ots
    .filter(o => otAfectaVentana(o, ctx, v))
    .flatMap(o => o.episodios
      ? o.episodios.map(e => ({ ini: e.ini, fin: e.fin ?? v.termino }))
      : [{ ini: o.fechaCreacion, fin: finDetencion(o) ?? v.termino }])
  return minutosDetencionEnPeriodo(ventanas, v.inicio, v.termino)
}

/** Delta = última lectura - primera lectura del equipo/faena dentro de la ventana efectiva. */
export function deltaHorometroEnVentana(lecturas: LecturaHorometro[], ctx: { equipoId: string; faenaId: string }, v: Ventana): number {
  const enVentana = lecturas
    .filter(l => l.equipoId === ctx.equipoId && l.faenaId === ctx.faenaId && l.horometro !== null
      && l.fecha.getTime() >= v.inicio.getTime() && l.fecha.getTime() <= v.termino.getTime())
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  if (enVentana.length < 2) return 0
  return Math.max(0, enVentana[enVentana.length - 1].horometro! - enVentana[0].horometro!)
}

// ── Episodios de detención de una OT (hasta la LIBERACIÓN operacional) ───────────────────────────────────────
export interface CambioEstadoOT { estadoAnterior: string | null; estadoNuevo: string; fechaCambio: Date }
export interface OtParaEpisodios {
  estado: string
  fechaCreacion: Date
  fechaTerminoTrabajo: Date | null
  fechaCierre: Date | null
  historial: CambioEstadoOT[]
}

/**
 * Cada OT puede tener varios episodios: uno desde su creación y uno más por cada reapertura de una OT cerrada.
 * Un episodio termina en la primera LIBERACIÓN del equipo posterior al término técnico (entrada a EN_VALIDACION o cierre),
 * de modo que la espera de validación y el retrabajo antes de liberar SÍ cuentan como detención.
 * - Sin liberación registrada: si esta OT es la última del equipo y el equipo sigue detenido, el episodio sigue abierto;
 *   si no, termina en el término técnico (datos anteriores a la liberación operacional u OT sin efecto sobre el estado del equipo).
 * - Una reapertura DESPUÉS de una liberación abre un episodio nuevo: el tiempo operando entre medio no se descuenta.
 */
export function episodiosDetencionOT(ot: OtParaEpisodios, liberaciones: Date[], opts: { equipoDetenidoActual: boolean; esUltimaOtDelEquipo: boolean; /** Fechas de creación de las OTRAS OT del equipo: una liberación posterior a una OT nueva no pertenece a esta. */ iniciosOtrasOt?: Date[] }): { ini: Date; fin: Date | null }[] {
  const hist = [...ot.historial].sort((a, b) => a.fechaCambio.getTime() - b.fechaCambio.getTime())
  const libs = [...liberaciones].sort((a, b) => a.getTime() - b.getTime())
  const inicios = [ot.fechaCreacion, ...hist.filter(h => h.estadoAnterior === 'CERRADA' && h.estadoNuevo !== 'CERRADA' && h.estadoNuevo !== 'ANULADA').map(h => h.fechaCambio)]
  const out: { ini: Date; fin: Date | null }[] = []
  inicios.forEach((ini, i) => {
    const hasta = inicios[i + 1] ?? null
    const ultimo = hasta === null
    const dentro = (t: Date) => t.getTime() > ini.getTime() && (hasta === null || t.getTime() <= hasta.getTime())
    let tecnico = hist.find(h => (h.estadoNuevo === 'EN_VALIDACION' || h.estadoNuevo === 'CERRADA') && dentro(h.fechaCambio))?.fechaCambio ?? null
    if (!tecnico && ultimo && ['EN_VALIDACION', 'CERRADA'].includes(ot.estado)) tecnico = ot.fechaTerminoTrabajo ?? ot.fechaCierre
    if (!tecnico) { out.push({ ini, fin: hasta }); return }
    // Tope: si se creó otra OT DESPUÉS del término técnico y antes de esa liberación, la liberación es de esa otra OT (esta ya terminó).
    const tope = (opts.iniciosOtrasOt ?? []).filter(x => x.getTime() > tecnico!.getTime()).sort((a, b) => a.getTime() - b.getTime())[0] ?? null
    const lib = libs.find(l => l.getTime() >= tecnico!.getTime() && (hasta === null || l.getTime() <= hasta.getTime()) && (tope === null || l.getTime() <= tope.getTime()))
    if (lib) out.push({ ini, fin: lib })
    else if (ultimo && opts.equipoDetenidoActual && opts.esUltimaOtDelEquipo) out.push({ ini, fin: null })
    else out.push({ ini, fin: hasta && hasta.getTime() < tecnico.getTime() ? hasta : tecnico })
  })
  return out
}
