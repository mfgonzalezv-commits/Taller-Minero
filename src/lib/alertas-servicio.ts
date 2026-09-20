// Carga la foto de datos, aplica el motor de alertas y guarda las notificaciones internas de forma idempotente.
// Lo ejecuta un proceso periódico (ver /api/alertas/procesar y scripts/procesar-alertas.ts). Solo escribe en `notificaciones`.
import type { PrismaClient } from '@prisma/client'
import { calcularAlertas, fechaLocalChile, type AlertaGenerada, type Evento, type SnapshotAlertas } from './alertas'
import { calcularPeriodo } from './periodo-pago'
import { ESTADOS_NO_OPERACIONALES } from './estados-equipo'

const DIA = 86_400_000
const ABIERTA = { notIn: ['CERRADA', 'ANULADA'] as ('CERRADA' | 'ANULADA')[] }

export async function cargarSnapshot(prisma: PrismaClient, ahora: Date): Promise<SnapshotAlertas> {
  const [reportes, otsCrit, ots, valid, items, compras, planes, faenas, equiposDetenidos, responsables, comprasDirectas] = await Promise.all([
    prisma.reporteFalla.findMany({ where: { estado: { in: ['PENDIENTE', 'EVALUADO'] }, detencionSolicitada: true, equipo: { estado: { in: [...ESTADOS_NO_OPERACIONALES] } } }, select: { id: true, faenaId: true, createdAt: true, descripcion: true, equipo: { select: { codigo: true } } } }),
    prisma.ordenTrabajo.findMany({ where: { prioridad: 'CRITICA', estado: ABIERTA, tecnicoAsignadoId: null }, select: { id: true, faenaId: true, fechaCreacion: true, numeroOt: true, equipo: { select: { codigo: true } } } }),
    prisma.ordenTrabajo.findMany({ where: { estado: { notIn: ['CERRADA', 'ANULADA', 'EN_VALIDACION'] } }, select: { id: true, faenaId: true, numeroOt: true, estado: true, updatedAt: true, equipo: { select: { codigo: true } }, historial: { select: { fechaCambio: true }, orderBy: { fechaCambio: 'desc' }, take: 1 }, bitacora: { select: { fechaHora: true }, orderBy: { fechaHora: 'desc' }, take: 1 } } }),
    prisma.ordenTrabajo.findMany({ where: { estado: 'EN_VALIDACION', fechaValidacionTecnica: null }, select: { id: true, faenaId: true, numeroOt: true, fechaTerminoTrabajo: true, updatedAt: true, equipo: { select: { codigo: true } } } }),
    prisma.itemBodega.findMany({ where: { activo: true, criticidad: 'ALTA', stockActual: { lte: 0 } }, select: { id: true, faenaId: true, codigo: true, descripcion: true, updatedAt: true } }),
    prisma.solicitudRepuesto.findMany({ where: { esCompraDirecta: true, aprobacionSolicitadaAt: { not: null }, aprobadaCentralPorId: null }, select: { id: true, faenaId: true, numeroSr: true, aprobacionSolicitadaAt: true, montoSolicitado: true } }),
    prisma.planMantenimiento.findMany({ where: { activo: true, otActivaId: null, OR: [{ proximaEjecucionFecha: { not: null } }, { proximaEjecucionHoras: { not: null } }] }, select: { id: true, faenaId: true, nombre: true, proximaEjecucionFecha: true, proximaEjecucionHoras: true, equipo: { select: { codigo: true, horometroActual: true } } } }),
    prisma.faena.findMany({ where: { activa: true, NOT: { codigo: { startsWith: 'SIM-' } } }, select: { id: true, nombre: true, createdAt: true } }),
    prisma.equipo.findMany({ where: { activo: true, estado: { in: [...ESTADOS_NO_OPERACIONALES] } }, select: { faenaId: true, updatedAt: true } }),
    prisma.usuario.findMany({ where: { rol: { in: ['JEFE_TALLER', 'PLANIFICADOR'] } }, select: { faenaId: true, activo: true, updatedAt: true } }),
    prisma.solicitudRepuesto.findMany({ where: { esCompraDirecta: true }, select: { otId: true, faenaId: true, createdAt: true, ot: { select: { numeroOt: true } } }, orderBy: { createdAt: 'asc' } }),
  ])
  // Inicio estable del episodio de stock agotado: el último movimiento que dejó el ítem en cero (no cualquier edición).
  const desdeAgotado = new Map<string, Date>()
  for (const i of items) {
    const m = await prisma.movimientoBodega.findFirst({ where: { itemId: i.id, stockDespues: { lte: 0 } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
    desdeAgotado.set(i.id, m?.createdAt ?? i.updatedAt)
  }

  const ev = (id: string, faenaId: string, desde: Date, detalle: string): Evento => ({ id, faenaId, desde, detalle })
  const hoyChile = fechaLocalChile(ahora.getTime())
  // Periodo en curso y periodo ANTERIOR (para poder avisar el atraso después del día 25, cuando el periodo en curso ya cambió).
  const actual = calcularPeriodo(new Date(hoyChile.y, hoyChile.m - 1, hoyChile.d))
  const anterior = calcularPeriodo(new Date(actual.inicio.getFullYear(), actual.inicio.getMonth(), actual.inicio.getDate() - 1))
  const eps = await prisma.estadoPago.findMany({ where: { periodoInicio: { in: [actual.inicio, anterior.inicio] }, estado: { in: ['PREPARADO', 'APROBADO'] } }, select: { faenaId: true, estado: true, periodoInicio: true } })

  return {
    ahora,
    hallazgosCriticos: reportes.map(r => ev(r.id, r.faenaId, r.createdAt, `${r.equipo.codigo} detenido: ${r.descripcion.slice(0, 120)}`)),
    otsCriticasSinResponsable: otsCrit.map(o => ev(o.id, o.faenaId, o.fechaCreacion, `OT ${o.numeroOt} (${o.equipo.codigo}) crítica sin responsable asignado`)),
    otsSinMovimiento: ots.map(o => ev(o.id, o.faenaId, new Date(Math.max(o.updatedAt.getTime(), o.historial[0]?.fechaCambio.getTime() ?? 0, o.bitacora[0]?.fechaHora.getTime() ?? 0)), `OT ${o.numeroOt} (${o.equipo.codigo}) en ${o.estado} sin movimiento`)),
    reparacionesPendientesValidacion: valid.map(o => ev(o.id, o.faenaId, o.fechaTerminoTrabajo ?? o.updatedAt, `OT ${o.numeroOt} (${o.equipo.codigo}): reparación terminada, falta la validación técnica`)),
    stockAgotado: items.map(i => ev(i.id, i.faenaId, desdeAgotado.get(i.id) as Date, `${i.codigo} ${i.descripcion}: stock crítico agotado`)),
    comprasPendientes: compras.map(c => ev(c.id, c.faenaId, c.aprobacionSolicitadaAt as Date, `SR-${String(c.numeroSr).padStart(4, '0')}: compra de $${Number(c.montoSolicitado ?? 0).toLocaleString('es-CL')} espera aprobación central`)),
    preventivos: planes.map(p => ({
      id: p.id, faenaId: p.faenaId, detalle: `${p.equipo.codigo}: ${p.nombre}`,
      diasRestantes: p.proximaEjecucionFecha ? Math.ceil((p.proximaEjecucionFecha.getTime() - ahora.getTime()) / DIA) : null,
      horasRestantes: p.proximaEjecucionHoras != null ? Number(p.proximaEjecucionHoras) - Number(p.equipo.horometroActual) : null,
      episodio: `${p.proximaEjecucionFecha?.getTime() ?? ''}-${p.proximaEjecucionHoras ?? ''}`,
    })),
    // Inicio ESTABLE del episodio: cuando se desactivó al último responsable (o el alta de la faena); no cambia al editar equipos.
    faenasSinResponsable: [...new Set(equiposDetenidos.map(e => e.faenaId))].filter(f => !responsables.some(r => r.faenaId === f && r.activo)).map(f => ev(f, f, new Date(Math.max(faenas.find(x => x.id === f)?.createdAt.getTime() ?? 0, ...responsables.filter(r => r.faenaId === f).map(r => r.updatedAt.getTime()))), 'La faena tiene equipos detenidos y no tiene Jefe de Taller ni Planificador activos: nadie puede liberarlos')),
    comprasSospechosas: comprasDirectas.flatMap((c, i, arr) => { const previa = arr.slice(0, i).reverse().find(o => o.otId === c.otId && c.createdAt.getTime() - o.createdAt.getTime() <= 24 * 3_600_000); return previa ? [ev(c.otId + ':' + c.createdAt.getTime(), c.faenaId, c.createdAt, `OT ${c.ot.numeroOt}: varias compras directas en 24 h; revisar posible fraccionamiento`)] : [] }),
    // El periodo anterior solo cuenta si la faena ya existía cuando terminó (no se avisa el atraso de periodos previos a su alta).
    estadosPago: faenas.flatMap(f => [actual, ...(f.createdAt <= anterior.termino ? [anterior] : [])].map(p => ({ faenaId: f.id, faenaNombre: f.nombre, periodoTermino: p.termino, hayPreparado: eps.some(e => e.faenaId === f.id && e.periodoInicio.getTime() === p.inicio.getTime()), hayAprobado: eps.some(e => e.faenaId === f.id && e.periodoInicio.getTime() === p.inicio.getTime() && e.estado === 'APROBADO') }))),
  }
}

/** Calcula y guarda. Devuelve cuántas notificaciones nuevas se crearon (las repetidas se ignoran por su clave única). */
export async function procesarAlertas(prisma: PrismaClient, ahora: Date = new Date()): Promise<{ generadas: number; nuevas: number; alertas: AlertaGenerada[] }> {
  const alertas = calcularAlertas(await cargarSnapshot(prisma, ahora))
  if (alertas.length === 0) return { generadas: 0, nuevas: 0, alertas }
  const r = await prisma.notificacion.createMany({
    data: alertas.map(a => ({ faenaId: a.faenaId, rolDestino: a.rolDestino, tipo: a.tipo, nivel: a.nivel, entidad: a.entidad, entidadId: a.entidadId, titulo: a.titulo, mensaje: a.mensaje, claveUnica: a.claveUnica })),
    skipDuplicates: true,
  })
  return { generadas: alertas.length, nuevas: r.count, alertas }
}
