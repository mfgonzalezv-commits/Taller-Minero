import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'
import { ESTADO_OT_CONFIG, PRIORIDAD_CONFIG } from '@/lib/constants'
import { getPlanes } from '@/actions/mantenimiento'
import { GraficoFlota } from '@/components/dashboard/GraficoFlota'
import { GraficoOperatividadSemanal } from '@/components/dashboard/GraficoOperatividadSemanal'
import { GraficoCostos } from '@/components/dashboard/GraficoCostos'
import { GraficoGestionTaller } from '@/components/dashboard/GraficoGestionTaller'
import Link from 'next/link'
import {
  ClipboardList, Truck, Wrench, Gauge, Package,
  BarChart3, Users, Plus, AlertTriangle, TrendingDown, Bell, ShoppingCart,
} from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()
  const faenaId = faena?.id

  const hace3Meses = new Date()
  hace3Meses.setDate(hace3Meses.getDate() - 91)

  const [equipos, todasLasOTs, otsActivas, equiposDetenidos, planes, otsHistoricas] = await Promise.all([
    prisma.equipo.findMany({ where: { faenaId } }),
    prisma.ordenTrabajo.findMany({
      where: { faenaId, estado: { not: 'CERRADA' } },
      select: { estado: true },
    }),
    prisma.ordenTrabajo.findMany({
      where: { faenaId, estado: { not: 'CERRADA' } },
      include: { equipo: { select: { codigo: true } } },
      orderBy: [{ prioridad: 'asc' }, { fechaCreacion: 'asc' }],
      take: 6,
    }),
    prisma.equipo.findMany({
      where: { faenaId, estado: { in: ['DETENIDO', 'TALLER'] } },
      orderBy: { costoDetencionAcumulado: 'desc' },
    }),
    getPlanes(),
    prisma.ordenTrabajo.findMany({
      where: { faenaId, fechaCreacion: { gte: hace3Meses } },
      select: { equipoId: true, fechaCreacion: true, fechaCierre: true },
    }),
  ])

  // Datos gráfico flota
  const flotaData = [
    { name: 'Operativo',  value: equipos.filter(e => e.estado === 'OPERATIVO').length,          color: '#4CAF50' },
    { name: 'Detenido',   value: equipos.filter(e => e.estado === 'DETENIDO').length,            color: '#E50914' },
    { name: 'En taller',  value: equipos.filter(e => e.estado === 'TALLER').length,              color: '#FF9F43' },
    { name: 'F. servicio',value: equipos.filter(e => e.estado === 'FUERA_DE_SERVICIO').length,   color: '#666666' },
  ].filter(d => d.value > 0)

  const pctOperativo = equipos.length
    ? Math.round((equipos.filter(e => e.estado === 'OPERATIVO').length / equipos.length) * 100)
    : 0

  // Conteo de estados para KPI de espera repuesto y gráfico gestión
  const conteoEstados = todasLasOTs.reduce((acc, ot) => {
    acc[ot.estado] = (acc[ot.estado] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // GraficoGestionTaller — OTs activas por estado
  const COLORES_ESTADO: Record<string, string> = {
    ABIERTA: '#6B7280', EN_DIAGNOSTICO: '#3B82F6', EN_REPARACION: '#EAB308',
    ESPERA_REPUESTO: '#F97316', EN_VALIDACION: '#A855F7',
  }
  const gestionData = Object.entries(conteoEstados)
    .filter(([e]) => e !== 'CERRADA')
    .map(([estado, count]) => ({
      estado: estado.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
      count,
      color: COLORES_ESTADO[estado] ?? '#6B7280',
    }))

  // Operatividad semanal real — últimos 3 meses
  const totalEquipos = equipos.length || 1
  const hoy = new Date()
  const diasHastaLunes = (hoy.getDay() + 6) % 7
  const ultimoLunes = new Date(hoy)
  ultimoLunes.setDate(hoy.getDate() - diasHastaLunes)

  const operatividadSemanal = Array.from({ length: 13 }, (_, i) => {
    const weekStart = new Date(ultimoLunes)
    weekStart.setDate(ultimoLunes.getDate() - (12 - i) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const equiposDetenidosEnSemana = new Set(
      otsHistoricas
        .filter(ot =>
          ot.fechaCreacion < weekEnd &&
          (ot.fechaCierre === null || ot.fechaCierre > weekStart)
        )
        .map(ot => ot.equipoId)
    ).size

    const pct = Math.round(((totalEquipos - equiposDetenidosEnSemana) / totalEquipos) * 100)
    const label = weekStart.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
    return { dia: label, pct: Math.max(0, pct) }
  })

  // Datos costos
  const costosData = equipos
    .filter(e => Number(e.costoDetencionAcumulado) > 0)
    .sort((a, b) => Number(b.costoDetencionAcumulado) - Number(a.costoDetencionAcumulado))
    .slice(0, 6)
    .map(e => ({ codigo: e.codigo, costo: Number(e.costoDetencionAcumulado) }))

  const costoTotal = equipos.reduce((acc, e) => acc + Number(e.costoDetencionAcumulado), 0)
  const otsCriticas = todasLasOTs.filter(o => o.estado !== 'CERRADA').length
  const alertasMantencion = planes.filter(p => p.urgente || p.vencido)

  // SRs pendientes
  const srsPendientes = await prisma.solicitudRepuesto.findMany({
    where: { faenaId, estado: { notIn: ['ENTREGADA', 'RECHAZADA'] } },
    include: {
      ot: { select: { numeroOt: true, id: true, equipo: { select: { codigo: true } } } },
      items: { select: { descripcion: true, cantidad: true, unidad: true } },
    },
    orderBy: [{ urgente: 'desc' }, { createdAt: 'asc' }],
    take: 6,
  })

  // Cuellos de botella: OTs en espera de repuesto
  const cuellos = await prisma.ordenTrabajo.findMany({
    where: { faenaId, estado: 'ESPERA_REPUESTO' },
    include: { equipo: { select: { codigo: true, nombre: true } } },
    orderBy: { updatedAt: 'asc' },
    take: 5,
  })

  const ESTADO_SR_LABEL: Record<string, { label: string; color: string }> = {
    ENVIADA:            { label: 'Enviada',            color: '#60a5fa' },
    EN_BODEGA_CENTRAL:  { label: 'Bodega Central',     color: '#c084fc' },
    EN_ADQUISICIONES:   { label: 'Adquisiciones',      color: '#fb923c' },
    ESPERANDO_LLEGADA:  { label: 'Esperando llegada',  color: '#facc15' },
    RECIBIDA_FAENA:     { label: 'Recibida en faena',  color: '#2dd4bf' },
  }

  const MODULOS = [
    { label: 'Órdenes de Trabajo', href: '/ot',                icon: ClipboardList, count: otsCriticas,            sub: 'activas' },
    { label: 'Equipos',            href: '/equipos',           icon: Truck,         count: equipos.length,         sub: 'en flota' },
    { label: 'Mantención Prev.',   href: '/mantenimiento',     icon: Wrench,        count: alertasMantencion.length, sub: 'alertas' },
    { label: 'Horómetros',         href: '/terreno/horometro', icon: Gauge,         count: null,                   sub: 'registro terreno' },
    { label: 'Bodega',             href: '/bodega',            icon: Package,       count: null,                   sub: 'inventario' },
    { label: 'Reportes',           href: '/reportes',          icon: BarChart3,     count: null,                   sub: 'costos y análisis' },
    { label: 'Usuarios',           href: '/usuarios',          icon: Users,         count: null,                   sub: 'gestión accesos' },
    { label: 'Nueva OT',           href: '/ot/nueva',          icon: Plus,          count: null,                   sub: 'acción rápida', accent: true },
  ]

  return (
    <AppShell>
      {/* Encabezado */}
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">{faena?.nombre ?? 'Dashboard'}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>{faena?.codigo} · {faena?.ubicacion}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded font-bold uppercase tracking-wider" style={{ backgroundColor: 'var(--n-surface)', color: 'var(--n-text-lt)' }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Flota total',        value: equipos.length,          sub: `${equipos.filter(e=>e.estado==='OPERATIVO').length} operativos`,  color: '#4CAF50' },
          { label: 'Equipos detenidos',  value: equiposDetenidos.length, sub: `${pctOperativo}% disponibilidad`,                                 color: equiposDetenidos.length > 0 ? 'var(--n-red)' : '#4CAF50' },
          { label: 'OTs activas',        value: otsCriticas,             sub: `${conteoEstados['ESPERA_REPUESTO'] || 0} en espera repuesto`,      color: 'var(--n-yellow)' },
          { label: 'Costo detención',    value: fmt(costoTotal),         sub: 'acumulado histórico',                                             color: 'var(--n-red)', small: true },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl p-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--n-text-lt)' }}>{kpi.label}</p>
            <p className={`font-black leading-none mb-1 ${kpi.small ? 'text-lg' : 'text-3xl'}`} style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs" style={{ color: 'var(--n-text-mid)' }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-3 gap-3 mb-6">
        <GraficoFlota data={flotaData} total={equipos.length} pctOperativo={pctOperativo} />
        <GraficoOperatividadSemanal data={operatividadSemanal} />
        <GraficoGestionTaller data={gestionData} />
      </div>

      {/* Módulos */}
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>Módulos</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {MODULOS.map((mod) => {
          const Icon = mod.icon
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={`rounded-lg px-4 py-3 flex items-center gap-3 transition-all duration-150 ${mod.accent ? 'n-module-card-accent' : 'n-module-card'}`}
              style={{
                backgroundColor: mod.accent ? 'var(--n-red)' : 'var(--n-surface)',
                border: `1px solid ${mod.accent ? 'transparent' : 'var(--n-border)'}`,
              }}
            >
              <div className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: mod.accent ? 'rgba(0,0,0,0.2)' : 'var(--n-yellow)' }}>
                <Icon size={17} color={mod.accent ? 'white' : '#1A1A1A'} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate" style={{ color: mod.accent ? 'white' : 'var(--n-text)' }}>{mod.label}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: mod.accent ? 'rgba(255,255,255,0.75)' : 'var(--n-text-lt)' }}>
                  {mod.count !== null ? `${mod.count} ${mod.sub}` : mod.sub}
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Fila inferior: 3 columnas */}
      <div className="grid lg:grid-cols-3 gap-3">

        {/* Costos por detención */}
        <GraficoCostos data={costosData} />

        {/* Cuellos de botella */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <AlertTriangle size={15} color="var(--n-red)" />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Cuellos de botella</span>
          </div>
          {cuellos.length === 0 ? (
            <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin cuellos de botella</p>
          ) : (
            cuellos.map((ot) => (
              <Link key={ot.id} href={`/ot/${ot.id}`} className="n-row-hover flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
                <TrendingDown size={15} color="var(--n-red)" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{ot.equipo.codigo}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--n-text-mid)' }}>Espera repuesto · OT #{ot.numeroOt}</p>
                </div>
              </Link>
            ))
          )}
          {cuellos.length === 0 && conteoEstados['ABIERTA'] > 0 && (
            <div className="px-5 pb-4">
              <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{conteoEstados['ABIERTA']} OTs abiertas sin asignar</p>
            </div>
          )}
        </div>

        {/* Recordatorios */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <div className="flex items-center gap-2">
              <Bell size={15} color="var(--n-yellow)" />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Recordatorios</span>
            </div>
            {alertasMantencion.length > 0 && (
              <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--n-red)', color: 'white' }}>
                {alertasMantencion.length}
              </span>
            )}
          </div>
          {alertasMantencion.length === 0 ? (
            <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin mantenciones pendientes</p>
          ) : (
            alertasMantencion.slice(0, 5).map((p) => (
              <Link key={p.id} href="/mantenimiento" className="n-row-hover flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
                <Wrench size={15} color={p.vencido ? 'var(--n-red)' : 'var(--n-yellow)'} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.nombre}</p>
                  <p className="text-xs" style={{ color: 'var(--n-text-mid)' }}>
                    {p.equipo.codigo} · <span style={{ color: p.vencido ? 'var(--n-red)' : 'var(--n-yellow)' }}>{p.vencido ? 'VENCIDA' : 'PRÓXIMA'}</span>
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>

      </div>

      {/* Solicitudes de Repuesto pendientes */}
      {srsPendientes.length > 0 && (
        <div className="mt-3 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <div className="flex items-center gap-2">
              <ShoppingCart size={15} color="var(--n-yellow)" />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Solicitudes de Repuesto</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,209,0,0.15)', color: 'var(--n-yellow)' }}>
                {srsPendientes.length} pendiente{srsPendientes.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="grid lg:grid-cols-2">
            {srsPendientes.map(sr => {
              const cfg = ESTADO_SR_LABEL[sr.estado] ?? { label: sr.estado, color: '#6B7280' }
              const codigo = `SR-${String(sr.numeroSr).padStart(4, '0')}`
              return (
                <Link key={sr.id} href={`/ot/${sr.ot.id}`} className="n-row-hover flex items-center gap-4 px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {sr.urgente && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
                      <span className="font-mono text-xs font-bold text-white">{codigo}</span>
                      <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>· OT #{sr.ot.numeroOt} · {sr.ot.equipo.codigo}</span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--n-text-mid)' }}>
                      {sr.items.map(i => `${i.descripcion} (${Number(i.cantidad)} ${i.unidad})`).join(', ')}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}>
                    {cfg.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* OTs en curso */}
      <div className="mt-3 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
          <div className="flex items-center gap-2">
            <ClipboardList size={15} color="var(--n-text-lt)" />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>OTs en curso</span>
          </div>
          <Link href="/ot" className="text-xs font-bold" style={{ color: 'var(--n-red)' }}>Ver todas →</Link>
        </div>
        {otsActivas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>No hay OTs activas</p>
        ) : (
          <div className="grid lg:grid-cols-2">
            {otsActivas.map((ot) => {
              const ec = ESTADO_OT_CONFIG[ot.estado as keyof typeof ESTADO_OT_CONFIG]
              const pc = PRIORIDAD_CONFIG[ot.prioridad as keyof typeof PRIORIDAD_CONFIG]
              return (
                <Link key={ot.id} href={`/ot/${ot.id}`} className="n-row-hover flex items-center gap-4 px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs" style={{ color: 'var(--n-text-lt)' }}>#{ot.numeroOt}</span>
                      <span className="font-bold text-sm text-white">{ot.equipo.codigo}</span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--n-text-mid)' }}>{ot.descripcionFalla}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pc.color}`}>{pc.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ec.color}`}>{ec.label}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
