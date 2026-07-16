import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ESTADO_EQUIPO_CONFIG, ESTADO_OT_CONFIG, PRIORIDAD_CONFIG } from '@/lib/constants'
import Link from 'next/link'
import { ChevronRight, Gauge, DollarSign, Plus, Pencil, Activity, ClipboardList, Printer } from 'lucide-react'
import BorrarEquipo from './BorrarEquipo'
import VincularPauta from './VincularPauta'
import { getPautasDisponibles } from '@/actions/pautas'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default async function EquipoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')
  const puedeEditar = session.user?.rol === 'ADMINISTRADOR' || session.user?.rol === 'JEFE_TALLER'

  const { id } = await params
  const equipo = await prisma.equipo.findUnique({
    where: { id },
    include: {
      ots: { orderBy: { fechaCreacion: 'desc' } },
      horometros: {
        orderBy: { fechaRegistro: 'desc' },
        take: 20,
        include: { usuario: { select: { nombre: true } } },
      },
      pauta: {
        include: {
          items: { orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] },
        },
      },
      faena: { select: { id: true, nombre: true } },
    },
  })

  if (!equipo) notFound()

  const ec = ESTADO_EQUIPO_CONFIG[equipo.estado]

  // KPIs hoja de vida
  const otsCerradas = equipo.ots.filter(o => o.estado === 'CERRADA')
  const otsCorrectivas = otsCerradas.filter(o => o.tipoMantenimiento === 'CORRECTIVO')
  const otsPreventivas = otsCerradas.filter(o => o.tipoMantenimiento === 'PREVENTIVO')
  const horasDetenidoTotal = equipo.ots.reduce((acc, o) => acc + o.tiempoDetenidoMin, 0) / 60

  // MTBF: promedio de horas entre fallas correctivas cerradas
  let mtbf: number | null = null
  if (otsCorrectivas.length >= 2) {
    const fechas = otsCorrectivas
      .filter(o => o.fechaCierre)
      .map(o => new Date(o.fechaCierre!).getTime())
      .sort((a, b) => a - b)
    if (fechas.length >= 2) {
      const diffs = fechas.slice(1).map((f, i) => (f - fechas[i]) / 3600000)
      mtbf = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
    }
  }

  const otsRecientes = equipo.ots.slice(0, 20)
  const todasPautas = puedeEditar ? await getPautasDisponibles() : []
  const pauta = equipo.pauta

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-5 text-xs font-medium" style={{ color: 'var(--n-text-lt)' }}>
        <Link href="/equipos" className="hover:text-white transition-colors">Equipos</Link>
        <ChevronRight size={13} />
        <span className="text-white">{equipo.codigo}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">{equipo.codigo}</h1>
          <p className="text-sm mt-0.5 font-semibold" style={{ color: 'var(--n-yellow)' }}>{equipo.nombre}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-3 py-1 text-sm font-bold ${ec.color}`}>{ec.label}</span>
          {puedeEditar && (
            <Link
              href={`/equipos/${equipo.id}/editar`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}
            >
              <Pencil size={12} /> Editar
            </Link>
          )}
          {puedeEditar && <BorrarEquipo equipoId={equipo.id} />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-4">

          {/* Ficha técnica */}
          <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--n-text-lt)' }}>Ficha técnica</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                { label: 'Marca / Modelo', value: equipo.marca ? `${equipo.marca} ${equipo.modelo ?? ''}`.trim() : null },
                { label: 'Patente',        value: (equipo as any).patente ?? null },
                { label: 'Año',            value: equipo.anio?.toString() },
                { label: 'Tipo',           value: equipo.tipo },
                { label: 'Faena',          value: equipo.faena?.nombre ?? null },
                { label: 'Ubicación',      value: equipo.ubicacionActual },
                { label: 'Horómetro',      value: Number(equipo.horometroActual) > 0 ? `${Number(equipo.horometroActual).toLocaleString()} h` : null },
                { label: 'Kilometraje',    value: Number(equipo.kilometrajeActual) > 0 ? `${Number(equipo.kilometrajeActual).toLocaleString()} km` : null },
              ].filter(f => f.value).map(field => (
                <div key={field.label}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--n-text-lt)' }}>{field.label}</p>
                  <p className="text-sm font-bold text-white">{field.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Hoja de vida — KPIs */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={15} color="var(--n-yellow)" />
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Hoja de vida</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'OTs correctivas', value: otsCorrectivas.length.toString() },
                { label: 'OTs preventivas', value: otsPreventivas.length.toString() },
                { label: 'Horas detenido', value: `${horasDetenidoTotal.toFixed(0)} h` },
                { label: 'MTBF', value: mtbf !== null ? `${mtbf} h` : '—', hint: 'Tiempo medio entre fallas' },
              ].map(kpi => (
                <div key={kpi.label}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--n-text-lt)' }}>{kpi.label}</p>
                  <p className="text-xl font-black text-white">{kpi.value}</p>
                  {kpi.hint && <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>{kpi.hint}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* OTs */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
                Órdenes de trabajo
                <span className="ml-2 font-normal" style={{ color: 'var(--n-text-lt)' }}>({equipo.ots.length} total)</span>
              </p>
              <Link href={`/ot/nueva?equipoId=${equipo.id}`} className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--n-red)' }}>
                <Plus size={13} /> Nueva OT
              </Link>
            </div>
            {equipo.ots.length === 0 ? (
              <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin OTs registradas</p>
            ) : (
              <>
              {equipo.ots.length > 20 && (
                <p className="px-5 py-2 text-xs" style={{ color: 'var(--n-text-lt)', borderBottom: '1px solid var(--n-border)' }}>
                  Mostrando las 20 más recientes de {equipo.ots.length} totales
                </p>
              )}
              {otsRecientes.map((ot) => {
                const otEc = ESTADO_OT_CONFIG[ot.estado]
                const otPc = PRIORIDAD_CONFIG[ot.prioridad]
                return (
                  <Link key={ot.id} href={`/ot/${ot.id}`} className="n-row-hover flex items-center gap-4 px-5 py-3.5" style={{ borderBottom: '1px solid var(--n-border)' }}>
                    <span className="font-mono text-xs shrink-0" style={{ color: 'var(--n-text-lt)' }}>#{ot.numeroOt}</span>
                    <p className="text-sm font-medium text-white flex-1 truncate">{ot.descripcionFalla}</p>
                    <div className="flex gap-2 shrink-0">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${otPc.color}`}>{otPc.label}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${otEc.color}`}>{otEc.label}</span>
                    </div>
                  </Link>
                )
              })}
              </>
            )}
          </div>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">

          {/* Costo detención */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={15} color="var(--n-yellow)" />
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Costo detención</p>
            </div>
            <p className="text-2xl font-black" style={{ color: 'var(--n-red)' }}>
              {fmt(Number(equipo.costoDetencionAcumulado))}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--n-text-lt)' }}>
              {fmt(Number(equipo.costoHoraDetencion))}/hr
            </p>
          </div>

          {/* Historial horómetros */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
              <div className="flex items-center gap-2">
                <Gauge size={14} color="var(--n-yellow)" />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Horómetros</p>
              </div>
              <Link href="/terreno/horometro" className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>+ Registrar</Link>
            </div>
            {equipo.horometros.length === 0 ? (
              <p className="px-5 py-5 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin lecturas registradas</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
                    {['Fecha', 'Horóm.', 'Km', 'Registrado por'].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipo.horometros.map((h) => (
                    <tr key={h.id} style={{ borderBottom: '1px solid var(--n-border)' }}>
                      <td className="px-4 py-2.5" style={{ color: 'var(--n-text-mid)' }}>{new Date(h.fechaRegistro).toLocaleDateString('es-CL')}</td>
                      <td className="px-4 py-2.5 font-bold text-white">{h.horometro != null ? `${Number(h.horometro).toLocaleString()} h` : '—'}</td>
                      <td className="px-4 py-2.5 font-bold text-white">{h.kilometraje != null ? `${Number(h.kilometraje).toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--n-text-lt)' }}>{h.usuario?.nombre ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Pauta de Mantenimiento Preventivo ── */}
      <div className="mt-6 rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)', backgroundColor: 'rgba(255,209,0,0.05)' }}>
          <div className="flex items-center gap-2">
            <ClipboardList size={15} color="var(--n-yellow)" />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              Pauta de Mantenimiento Preventivo
            </p>
            {pauta && (
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,209,0,0.15)', color: 'var(--n-yellow)' }}>
                {pauta.tipoMetrica} · {pauta.ciclosDisponibles.length} ciclos
              </span>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          {!pauta ? (
            <div>
              <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>
                Este equipo no tiene pauta de mantenimiento vinculada.
              </p>
              {puedeEditar && (
                <VincularPauta equipoId={equipo.id} pautas={todasPautas} pautaActualId={null} />
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm font-bold text-white">{pauta.nombre}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>
                    Ciclos: {pauta.ciclosDisponibles.map(c =>
                      pauta.tipoMetrica === 'KM' ? `${c.toLocaleString()} km` : `${c.toLocaleString()} hrs`
                    ).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/pautas/${pauta.id}?equipoId=${equipo.id}`}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition hover:opacity-80"
                    style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}
                  >
                    <Printer size={12} /> Ver / Imprimir pauta
                  </Link>
                  {puedeEditar && (
                    <VincularPauta equipoId={equipo.id} pautas={todasPautas} pautaActualId={pauta.id} />
                  )}
                </div>
              </div>

              {/* Tabla de ítems agrupada por categoría */}
              {(['FLUIDO', 'FILTRO', 'ACCESORIO'] as const).map(cat => {
                const itemsCat = pauta.items.filter(i => i.categoria === cat)
                if (itemsCat.length === 0) return null
                const catLabel: Record<string, string> = { FLUIDO: 'Fluidos', FILTRO: 'Filtros', ACCESORIO: 'Accesorios y correas' }
                return (
                  <div key={cat} className="mb-5">
                    <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--n-text-lt)' }}>{catLabel[cat]}</p>
                    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--n-border)' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="w-full text-xs" style={{ minWidth: 600 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--n-border)', backgroundColor: 'var(--n-bg)' }}>
                              <th className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)', width: '24%' }}>Componente</th>
                              <th className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)', width: '20%' }}>Alternativo</th>
                              <th className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)', width: '8%' }}>Cant.</th>
                              {pauta.ciclosDisponibles.map(c => (
                                <th key={c} className="px-2 py-2 text-center font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)', whiteSpace: 'nowrap' }}>
                                  {pauta.tipoMetrica === 'KM' ? `${(c/1000).toFixed(0)}k km` : `${c.toLocaleString()} h`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {itemsCat.map(item => (
                              <tr key={item.id} className="n-row-hover" style={{ borderBottom: '1px solid var(--n-border)' }}>
                                <td className="px-3 py-2.5 font-semibold text-white">{item.componente}</td>
                                <td className="px-3 py-2.5" style={{ color: 'var(--n-text-lt)', fontSize: 10 }}>{item.alternativo || item.normativa || '—'}</td>
                                <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--n-text-mid)' }}>
                                  {item.cantidad ? `${Number(item.cantidad)} ${item.unidad ?? 'un'}` : '—'}
                                </td>
                                {pauta.ciclosDisponibles.map(c => {
                                  const esReemplazar = item.ciclosReemplazar.includes(c)
                                  const esCondicionar = item.ciclosCondicionar.includes(c)
                                  return (
                                    <td key={c} className="px-2 py-2.5 text-center">
                                      {esReemplazar && (
                                        <span className="inline-block rounded px-1.5 py-0.5 text-xs font-bold" style={{ backgroundColor: 'rgba(61,190,122,0.15)', color: '#3DBE7A' }}>
                                          CAM
                                        </span>
                                      )}
                                      {esCondicionar && (
                                        <span className="inline-block rounded px-1.5 py-0.5 text-xs font-bold" style={{ backgroundColor: 'rgba(255,159,67,0.15)', color: '#FF9F43' }}>
                                          REV
                                        </span>
                                      )}
                                      {!esReemplazar && !esCondicionar && (
                                        <span style={{ color: 'var(--n-text-lt)' }}>—</span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

    </AppShell>
  )
}
