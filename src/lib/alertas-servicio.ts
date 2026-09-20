// Carga la foto de datos, aplica el motor de alertas y guarda las notificaciones internas de forma idempotente.
// Lo ejecuta un proceso periódico (ver /api/alertas/procesar y scripts/procesar-alertas.ts). Solo escribe en `notificaciones`.
import type { PrismaClient } from '@prisma/client'
import { calcularAlertas, fechaLocalChile, type AlertaGenerada, type Evento, type SnapshotAlertas } from './alertas'
import { calcularPeriodo } from './periodo-pago'

const DIA = 86_400_000
const ABIERTA = { notIn: ['CERRADA', 'ANULADA'] as ('CERRADA' | 'ANULADA')[] }

export async function cargarSnapshot(prisma: PrismaClient, ahora: Date): Promise<SnapshotAlertas> {
  const [reportes, otsCrit, ots, valid, items, compras, planes, faenas] = await Promise.all([
    prisma.reporteFalla.findMany({ where: { estado: { in: ['PENDIENTE', 'EVALUADO'] }, detencionSolicitada: true, equipo: { estado: { in: ['DETENIDO', 'DETENIDO_PENDIENTE_VALIDACION'] } } }, select: { id: true, faenaId: true, createdAt: true, descripcion: true, equipo: { select: { codigo: true } } } }),
    prisma.ordenTrabajo.findMany({ where: { prioridad: 'CRITICA', estado: ABIERTA, tecnicoAsignadoId: null }, select: { id: true, faenaId: true, fechaCreacion: true, numeroOt: true, equipo: { select: { codigo: true } } } }),
    prisma.ordenTrabajo.findMany({ where: { estado: { notIn: ['CERRADA', 'ANULADA', 'EN_VALIDACION'] } }, select: { id: true, faenaId: true, numeroOt: true, estado: true, updatedAt: true, equipo: { select: { codigo: true } }, historial: { select: { fechaCambio: true }, orderBy: { fechaCambio: 'desc' }, take: 1 }, bitacora: { select: { fechaHora: true }, orderBy: { fechaHora: 'desc' }, take: 1 } } }),
    prisma.ordenTrabajo.findMany({ where: { estado: 'EN_VALIDACION', fechaValidacionTecnica: null }, select: { id: true, faenaId: true, numeroOt: true, fechaTerminoTrabajo: true, updatedAt: true, equipo: { select: { codigo: true } } } }),
    prisma.itemBodega.findMany({ where: { activo: true, criticidad: 'ALTA', stockActual: { lte: 0 } }, select: { id: true, faenaId: true, codigo: true, descripcion: true, updatedAt: true } }),
    prisma.solicitudRepuesto.findMany({ where: { esCompraDirecta: true, aprobacionSolicitadaAt: { not: null }, aprobadaCentralPorId: null }, select: { id: true, faenaId: true, numeroSr: true, aprobacionSolicitadaAt: true, montoSolicitado: true } }),
    prisma.planMantenimiento.findMany({ where: { activo: true, otActivaId: null, OR: [{ proximaEjecucionFecha: { not: null } }, { proximaEjecucionHoras: { not: null } }] }, select: { id: true, faenaId: true, nombre: true, proximaEjecucionFecha: true, proximaEjecucionHoras: true, equipo: { select: { codigo: true, horometroActual: true } } } }),
    prisma.faena.findMany({ where: { activa: true, NOT: { codigo: { startsWith: 'SIM-' } } }, select: { id: true, nombre: true } }),
  ])

  const ev = (id: string, faenaId: string, desde: Date, detalle: string): Evento => ({ id, faenaId, desde, detalle })
  const hoyChile = fechaLocalChile(ahora.getTime())
  const { inicio, termino } = calcularPeriodo(new Date(hoyChile.y, hoyChile.m - 1, hoyChile.d))
  const eps = await prisma.estadoPago.findMany({ where: { periodoInicio: inicio, estado: { in: ['PREPARADO', 'APROBADO'] } }, select: { faenaId: true, estado: true } })

  return {
    ahora,
    hallazgosCriticos: reportes.map(r => ev(r.id, r.faenaId, r.createdAt, `${r.equipo.codigo} detenido: ${r.descripcion.slice(0, 120)}`)),
    otsCriticasSinResponsable: otsCrit.map(o => ev(o.id, o.faenaId, o.fechaCreacion, `OT ${o.numeroOt} (${o.equipo.codigo}) crítica sin responsable asignado`)),
    otsSinMovimiento: ots.map(o => ev(o.id, o.faenaId, new Date(Math.max(o.updatedAt.getTime(), o.historial[0]?.fechaCambio.getTime() ?? 0, o.bitacora[0]?.fechaHora.getTime() ?? 0)), `OT ${o.numeroOt} (${o.equipo.codigo}) en ${o.estado} sin movimiento`)),
    reparacionesPendientesValidacion: valid.map(o => ev(o.id, o.faenaId, o.fechaTerminoTrabajo ?? o.updatedAt, `OT ${o.numeroOt} (${o.equipo.codigo}): reparación terminada, falta la validación técnica`)),
    stockAgotado: items.map(i => ev(i.id, i.faenaId, i.updatedAt, `${i.codigo} ${i.descripcion}: stock crítico agotado`)),
    comprasPendientes: compras.map(c => ev(c.id, c.faenaId, c.aprobacionSolicitadaAt as Date, `SR-${String(c.numeroSr).padStart(4, '0')}: compra de $${Number(c.montoSolicitado ?? 0).toLocaleString('es-CL')} espera aprobación central`)),
    preventivos: planes.map(p => ({
      id: p.id, faenaId: p.faenaId, detalle: `${p.equipo.codigo}: ${p.nombre}`,
      diasRestantes: p.proximaEjecucionFecha ? Math.ceil((p.proximaEjecucionFecha.getTime() - ahora.getTime()) / DIA) : null,
      horasRestantes: p.proximaEjecucionHoras != null ? Number(p.proximaEjecucionHoras) - Number(p.equipo.horometroActual) : null,
    })),
    estadosPago: faenas.map(f => ({ faenaId: f.id, faenaNombre: f.nombre, periodoTermino: termino, hayPreparado: eps.some(e => e.faenaId === f.id), hayAprobado: eps.some(e => e.faenaId === f.id && e.estado === 'APROBADO') })),
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
