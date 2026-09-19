// Consultas de monitoreo del piloto. SOLO LECTURA: ninguna escribe en la base. Se pueden ejecutar
// contra desarrollo o producción (scripts/monitoreo.ts). Cada consulta devuelve las filas que
// requieren atención; una lista vacía significa "sin novedades".
import type { PrismaClient } from '@prisma/client'

const DIA = 86_400_000

export interface Hallazgo { detalle: string; [k: string]: unknown }
export interface ResultadoMonitoreo { id: string; titulo: string; criterio: string; filas: Hallazgo[] }
export interface OpcionesMonitoreo { faenaCodigo?: string; ahora?: Date; diasOtSinMovimiento?: number; diasSrDetenida?: number; horasAlertaSinOt?: number; diasPermisos?: number }

export async function ejecutarMonitoreo(prisma: PrismaClient, o: OpcionesMonitoreo = {}): Promise<ResultadoMonitoreo[]> {
  const ahora = o.ahora ?? new Date()
  const faena = o.faenaCodigo ? await prisma.faena.findUnique({ where: { codigo: o.faenaCodigo.toUpperCase() } }) : null
  if (o.faenaCodigo && !faena) throw new Error(`La faena ${o.faenaCodigo} no existe`)
  const fw = faena ? { faenaId: faena.id } : {}
  const diasOt = o.diasOtSinMovimiento ?? 3, diasSr = o.diasSrDetenida ?? 3, horasAl = o.horasAlertaSinOt ?? 24, diasPerm = o.diasPermisos ?? 7
  const out: ResultadoMonitoreo[] = []

  // 1. OT abiertas sin movimiento
  const ots = await prisma.ordenTrabajo.findMany({
    where: { ...fw, estado: { notIn: ['CERRADA', 'ANULADA'] } },
    select: { numeroOt: true, estado: true, updatedAt: true, equipo: { select: { codigo: true } }, historial: { select: { fechaCambio: true }, orderBy: { fechaCambio: 'desc' }, take: 1 }, bitacora: { select: { fechaHora: true }, orderBy: { fechaHora: 'desc' }, take: 1 } },
  })
  out.push({
    id: 'ot-sin-movimiento', titulo: 'OT abiertas sin movimiento', criterio: `sin cambio de estado ni bitácora hace más de ${diasOt} días`,
    filas: ots.map(ot => {
      const ultima = Math.max(ot.updatedAt.getTime(), ot.historial[0]?.fechaCambio.getTime() ?? 0, ot.bitacora[0]?.fechaHora.getTime() ?? 0)
      return { ot, dias: Math.floor((ahora.getTime() - ultima) / DIA) }
    }).filter(x => x.dias >= diasOt).sort((a, b) => b.dias - a.dias).map(x => ({ detalle: `OT ${x.ot.numeroOt} (${x.ot.equipo.codigo}) en ${x.ot.estado}: ${x.dias} días sin movimiento`, numeroOt: x.ot.numeroOt, estado: x.ot.estado, dias: x.dias })),
  })

  // 2. Stock vs lotes (y valores negativos)
  const items = await prisma.itemBodega.findMany({ where: { ...fw, activo: true }, select: { codigo: true, stockActual: true, lotes: { select: { cantidadSaldo: true } } } })
  out.push({
    id: 'stock-vs-lotes', titulo: 'Diferencias entre stock y lotes', criterio: 'stock_actual distinto de la suma de saldos de lotes, o saldo/stock negativo',
    filas: items.flatMap(it => {
      const suma = it.lotes.reduce((a, l) => a + Number(l.cantidadSaldo), 0), stock = Number(it.stockActual)
      const neg = it.lotes.some(l => Number(l.cantidadSaldo) < 0) || stock < 0
      return Math.abs(stock - suma) > 0.005 || neg ? [{ detalle: `${it.codigo}: stock ${stock} · lotes ${suma}${neg ? ' · NEGATIVO' : ''}`, codigo: it.codigo, stock, lotes: suma }] : []
    }),
  })

  // 3. Horómetros pendientes de confirmación
  const pend = await prisma.horometroKm.findMany({ where: { ...fw, validado: false, origen: 'pendiente_confirmacion' }, select: { horometro: true, kilometraje: true, fechaRegistro: true, advertencia: true, equipo: { select: { codigo: true } } }, orderBy: { fechaRegistro: 'asc' } })
  out.push({
    id: 'horometros-pendientes', titulo: 'Horómetros pendientes de confirmación', criterio: 'saltos anómalos que un Jefe/Planificador aún no confirma ni rechaza',
    filas: pend.map(p => ({ detalle: `${p.equipo.codigo}: ${p.horometro ?? p.kilometraje} (${p.advertencia ?? ''}) desde hace ${Math.floor((ahora.getTime() - p.fechaRegistro.getTime()) / DIA)} días` })),
  })

  // 4. Alertas de inspección sin OT
  const corte = new Date(ahora.getTime() - horasAl * 3_600_000)
  const alertas = await prisma.alertaInspeccion.findMany({ where: { ...fw, otId: null, estado: 'PENDIENTE', createdAt: { lt: corte } }, select: { descripcion: true, criticidad: true, createdAt: true, equipo: { select: { codigo: true } } }, orderBy: { createdAt: 'asc' } })
  out.push({
    id: 'alertas-sin-ot', titulo: 'Alertas de inspección sin OT', criterio: `alertas pendientes sin OT hace más de ${horasAl} h`,
    filas: alertas.map(a => ({ detalle: `${a.equipo.codigo} [${a.criticidad}] ${a.descripcion} — hace ${Math.floor((ahora.getTime() - a.createdAt.getTime()) / 3_600_000)} h` })),
  })

  // 5. Intentos rechazados por permisos
  const denegados = await prisma.registroAuditoria.findMany({ where: { ...fw, accion: 'DENEGADO', createdAt: { gte: new Date(ahora.getTime() - diasPerm * DIA) } }, select: { motivo: true, valorNuevo: true, usuario: { select: { email: true } } } })
  const agrupado = new Map<string, { n: number; email: string; rol: string; motivo: string }>()
  for (const d of denegados) {
    const rol = String((d.valorNuevo as { rol?: string } | null)?.rol ?? '?'), email = d.usuario?.email ?? '?'
    const k = `${email}|${d.motivo}`
    const v = agrupado.get(k) ?? { n: 0, email, rol, motivo: d.motivo ?? '' }
    v.n++; agrupado.set(k, v)
  }
  out.push({
    id: 'permisos-rechazados', titulo: 'Intentos rechazados por permisos', criterio: `últimos ${diasPerm} días, agrupados por usuario y motivo (pocos = uso normal; muchos o repetidos = revisar capacitación o abuso)`,
    filas: [...agrupado.values()].sort((a, b) => b.n - a.n).map(v => ({ detalle: `${v.email} (${v.rol}): ${v.n} × ${v.motivo}` })),
  })

  // 6. Solicitudes de repuesto detenidas o inconsistentes
  const srs = await prisma.solicitudRepuesto.findMany({ where: fw, select: { numeroSr: true, estado: true, updatedAt: true, esCompraDirecta: true, regularizada: true, createdAt: true, otId: true, historial: { select: { estadoNuevo: true } } } })
  const filasSr: Hallazgo[] = []
  for (const s of srs) {
    const dias = Math.floor((ahora.getTime() - s.updatedAt.getTime()) / DIA)
    const nombre = `SR-${String(s.numeroSr).padStart(4, '0')}`
    if (!['ENTREGADA', 'RECHAZADA'].includes(s.estado) && s.estado !== 'BORRADOR' && dias >= diasSr) filasSr.push({ detalle: `${nombre} detenida en ${s.estado} hace ${dias} días` })
    if (s.estado === 'ENTREGADA' && !s.historial.some(h => h.estadoNuevo === 'ENTREGADA')) filasSr.push({ detalle: `${nombre} ENTREGADA sin registro en su historial (inconsistente)` })
    if (s.esCompraDirecta && !s.regularizada && Math.floor((ahora.getTime() - s.createdAt.getTime()) / DIA) >= 15) filasSr.push({ detalle: `${nombre} compra directa sin regularizar hace más de 15 días` })
  }
  const rep = await prisma.repuestoOT.findMany({ where: { ...fw, estadoSolicitud: { in: ['SOLICITADO', 'AUTORIZADO', 'EN_COMPRAS'] }, createdAt: { lt: new Date(ahora.getTime() - diasSr * DIA) } }, select: { descripcion: true, estadoSolicitud: true, createdAt: true, ot: { select: { numeroOt: true } } } })
  for (const r of rep) filasSr.push({ detalle: `Repuesto "${r.descripcion}" de OT ${r.ot.numeroOt} sigue ${r.estadoSolicitud} hace ${Math.floor((ahora.getTime() - r.createdAt.getTime()) / DIA)} días` })
  out.push({ id: 'sr-detenidas', titulo: 'Solicitudes de repuesto detenidas o inconsistentes', criterio: `SR sin avanzar ${diasSr}+ días, SR entregadas sin historial, compras directas sin regularizar, repuestos de OT sin entregar`, filas: filasSr })

  // 7. Estados de Pago aprobados sin líneas (anomalía histórica conocida)
  const eps = await prisma.estadoPago.findMany({ where: { ...fw, estado: 'APROBADO' }, select: { periodoInicio: true, totalNeto: true, _count: { select: { lineas: true } }, faena: { select: { codigo: true } } } })
  out.push({ id: 'ep-sin-lineas', titulo: 'Estados de Pago aprobados sin líneas', criterio: 'aprobados con 0 líneas (revisar; no se modifican desde el monitoreo)', filas: eps.filter(e => e._count.lineas === 0).map(e => ({ detalle: `${e.faena.codigo} periodo ${e.periodoInicio.toISOString().slice(0, 10)}: neto $${Number(e.totalNeto)} con 0 líneas` })) })

  return out
}

export function monitoreoATexto(res: ResultadoMonitoreo[], ctx: { base: string; faena?: string; ahora: Date }): string {
  const L = [`# Monitoreo — base "${ctx.base}"${ctx.faena ? ` — faena ${ctx.faena}` : ' — todas las faenas'} — ${ctx.ahora.toISOString()}`, '']
  L.push('| Consulta | Requieren atención |', '|---|---:|', ...res.map(r => `| ${r.titulo} | ${r.filas.length} |`), '')
  for (const r of res) {
    L.push(`## ${r.titulo} (${r.filas.length})`, `_${r.criterio}_`, '', ...(r.filas.length ? r.filas.slice(0, 25).map(f => `- ${f.detalle}`) : ['Sin novedades']))
    if (r.filas.length > 25) L.push(`- … y ${r.filas.length - 25} más`)
    L.push('')
  }
  return L.join('\n')
}
