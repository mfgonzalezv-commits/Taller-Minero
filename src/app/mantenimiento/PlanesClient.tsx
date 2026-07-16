'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarEjecucion, eliminarPlan, programarParada, generarOT } from '@/actions/mantenimiento'
import { Search, X, AlertTriangle, CheckCircle, Calendar, ClipboardList, ChevronDown, ChevronUp, History } from 'lucide-react'
import Link from 'next/link'

type Tarea = { id: string; descripcion: string; codigo?: string | null; cantidad?: number | null; unidad?: string | null; obligatorio: boolean; orden: number }
type Ejecucion = {
  id: string
  fechaEjecucion: string
  horometroAlEjecutar: number | null
  kmAlEjecutar: number | null
  otId: string | null
  observacion: string | null
  usuario: { nombre: string } | null
}

type Plan = {
  id: string
  nombre: string
  descripcion: string | null
  intervaloHoras: number | null
  intervaloKm: number | null
  intervaloDias: number | null
  proximaEjecucionHoras: number | null
  proximaEjecucionKm: number | null
  proximaEjecucionFecha: string | null
  ultimaEjecucion: string | null
  fechaProgramada: string | null
  otActivaId: string | null
  alertaHoras: number | null
  alertaKm: number | null
  alertaDias: number | null
  urgente: boolean
  vencido: boolean
  ciclo: { id: string; nombre: string } | null
  tareas: Tarea[]
  ejecuciones: Ejecucion[]
  equipo: { id: string; codigo: string; nombre: string; horometroActual: number; kilometrajeActual: number }
}

export default function PlanesClient({ planes }: { planes: Plan[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busqueda, setBusqueda] = useState('')
  const [soloUrgentes, setSoloUrgentes] = useState(false)
  const [soloVencidos, setSoloVencidos] = useState(false)
  const [programandoId, setProgramandoId] = useState<string | null>(null)
  const [fechaInput, setFechaInput] = useState('')
  const [expandedTareas, setExpandedTareas] = useState<Set<string>>(new Set())
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const [obsInput, setObsInput] = useState('')
  const [ejecutandoId, setEjecutandoId] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    return planes.filter((p) => {
      if (soloVencidos && !p.vencido) return false
      if (soloUrgentes && !p.urgente && !p.vencido) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        return p.nombre.toLowerCase().includes(q) ||
          p.equipo.codigo.toLowerCase().includes(q) ||
          p.equipo.nombre.toLowerCase().includes(q) ||
          (p.ciclo?.nombre.toLowerCase().includes(q) ?? false)
      }
      return true
    })
  }, [planes, soloUrgentes, soloVencidos, busqueda])

  const run = (fn: () => Promise<unknown>) => {
    startTransition(async () => { await fn(); router.refresh() })
  }

  const toggleTareas = (id: string) =>
    setExpandedTareas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleHistory = (id: string) =>
    setExpandedHistory(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (planes.length === 0) {
    return (
      <div className="rounded-xl p-8 text-sm text-center" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}>
        No hay planes de mantención. Crea uno desde el formulario.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--n-text-lt)' }} />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por plan, equipo o ciclo..." className="n-input pl-9" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Vencidos', activo: soloVencidos, toggle: () => { setSoloVencidos(v => !v); setSoloUrgentes(false) }, color: 'var(--n-red)' },
            { label: 'Próximos', activo: soloUrgentes, toggle: () => { setSoloUrgentes(u => !u); setSoloVencidos(false) }, color: 'var(--n-yellow)' },
          ].map(({ label, activo, toggle, color }) => (
            <button key={label} onClick={toggle}
              className="rounded px-2.5 py-1 text-xs font-bold transition-all"
              style={{ backgroundColor: activo ? color : 'var(--n-bg)', color: activo ? (color === 'var(--n-yellow)' ? '#1A1A1A' : 'white') : 'var(--n-text-lt)', border: `1px solid ${activo ? color : 'var(--n-border)'}` }}
            >{label}</button>
          ))}
          {(soloUrgentes || soloVencidos || busqueda.trim()) && (
            <button onClick={() => { setBusqueda(''); setSoloUrgentes(false); setSoloVencidos(false) }} className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--n-text-lt)' }}>
              <X size={12} /> Limpiar
            </button>
          )}
          <span className="ml-auto text-xs" style={{ color: 'var(--n-text-lt)' }}>{filtrados.length} de {planes.length}</span>
        </div>
      </div>

      {filtrados.length === 0 && (
        <p className="py-6 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin planes para estos filtros</p>
      )}

      {filtrados.map((p) => {
        const accentColor = p.vencido ? 'var(--n-red)' : p.urgente ? 'var(--n-yellow)' : 'var(--n-border)'
        const showTareas = expandedTareas.has(p.id)
        const showHistory = expandedHistory.has(p.id)

        return (
          <div key={p.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: `1px solid var(--n-border)`, borderLeft: `3px solid ${accentColor}` }}>
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {p.vencido && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(229,9,20,0.15)', color: 'var(--n-red)' }}>
                        <AlertTriangle size={11} /> VENCIDO
                      </span>
                    )}
                    {p.urgente && !p.vencido && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,209,0,0.15)', color: 'var(--n-yellow)' }}>
                        <AlertTriangle size={11} /> PRÓXIMO
                      </span>
                    )}
                    {p.otActivaId && (
                      <Link href={`/ot/${p.otActivaId}`} className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded hover:opacity-80 transition" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                        <ClipboardList size={11} /> OT generada
                      </Link>
                    )}
                    {p.fechaProgramada && !p.otActivaId && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                        <Calendar size={11} /> Parada: {new Date(p.fechaProgramada).toLocaleDateString('es-CL')}
                      </span>
                    )}
                    {p.ciclo && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,209,0,0.1)', color: 'var(--n-yellow)', border: '1px solid rgba(255,209,0,0.2)' }}>
                        ↻ {p.ciclo.nombre}
                      </span>
                    )}
                    <span className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>{p.equipo.codigo}</span>
                    <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{p.equipo.nombre}</span>
                  </div>

                  <h3 className="font-bold text-white">{p.nombre}</h3>
                  {p.descripcion && <p className="text-sm mt-0.5" style={{ color: 'var(--n-text-mid)' }}>{p.descripcion}</p>}

                  {/* Métricas */}
                  <div className="flex flex-wrap gap-5 mt-3">
                    {p.intervaloHoras !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Intervalo</p>
                        <p className="text-sm font-bold text-white">{p.intervaloHoras} h</p>
                      </div>
                    )}
                    {p.intervaloKm !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Intervalo</p>
                        <p className="text-sm font-bold text-white">{p.intervaloKm.toLocaleString()} km</p>
                      </div>
                    )}
                    {p.intervaloDias !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Intervalo</p>
                        <p className="text-sm font-bold text-white">{p.intervaloDias} días</p>
                      </div>
                    )}
                    {p.alertaHoras !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{p.alertaHoras <= 0 ? 'Vencido' : 'Faltan'}</p>
                        <p className="text-sm font-bold" style={{ color: p.alertaHoras <= 0 ? 'var(--n-red)' : p.alertaHoras <= 50 ? 'var(--n-yellow)' : 'white' }}>
                          {Math.abs(p.alertaHoras)} h
                        </p>
                      </div>
                    )}
                    {p.alertaKm !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{p.alertaKm <= 0 ? 'Vencido' : 'Faltan'}</p>
                        <p className="text-sm font-bold" style={{ color: p.alertaKm <= 0 ? 'var(--n-red)' : p.alertaKm <= 500 ? 'var(--n-yellow)' : 'white' }}>
                          {Math.abs(p.alertaKm).toLocaleString()} km
                        </p>
                      </div>
                    )}
                    {p.alertaDias !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{p.alertaDias <= 0 ? 'Vencido' : 'Faltan'}</p>
                        <p className="text-sm font-bold" style={{ color: p.alertaDias <= 0 ? 'var(--n-red)' : p.alertaDias <= 7 ? 'var(--n-yellow)' : 'white' }}>
                          {Math.abs(p.alertaDias)} días
                        </p>
                      </div>
                    )}
                    {p.proximaEjecucionHoras !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Próxima a</p>
                        <p className="text-sm font-bold text-white">{p.proximaEjecucionHoras} h</p>
                      </div>
                    )}
                    {p.proximaEjecucionKm !== null && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Próxima a</p>
                        <p className="text-sm font-bold text-white">{p.proximaEjecucionKm.toLocaleString()} km</p>
                      </div>
                    )}
                    {p.proximaEjecucionFecha && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Próxima fecha</p>
                        <p className="text-sm font-bold text-white">{new Date(p.proximaEjecucionFecha).toLocaleDateString('es-CL')}</p>
                      </div>
                    )}
                    {p.ultimaEjecucion && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Última ejec.</p>
                        <p className="text-sm font-bold text-white">{new Date(p.ultimaEjecucion).toLocaleDateString('es-CL')}</p>
                      </div>
                    )}
                  </div>

                  {/* Botones expandibles */}
                  <div className="flex gap-3 mt-3">
                    {p.tareas.length > 0 && (
                      <button onClick={() => toggleTareas(p.id)} className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--n-text-lt)' }}>
                        {showTareas ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {p.tareas.length} tarea{p.tareas.length > 1 ? 's' : ''}
                      </button>
                    )}
                    {p.ejecuciones.length > 0 && (
                      <button onClick={() => toggleHistory(p.id)} className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--n-text-lt)' }}>
                        <History size={12} /> Historial ({p.ejecuciones.length})
                        {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {!p.otActivaId && (
                    <button
                      onClick={() => setProgramandoId(programandoId === p.id ? null : p.id)}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                      style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                    >
                      <Calendar size={12} /> Programar
                    </button>
                  )}
                  {!p.otActivaId && (
                    <button
                      onClick={() => run(() => generarOT(p.id))}
                      disabled={isPending}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                      style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}
                    >
                      <ClipboardList size={12} /> Generar OT
                    </button>
                  )}
                  <button
                    onClick={() => setEjecutandoId(ejecutandoId === p.id ? null : p.id)}
                    disabled={isPending}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                    style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
                  >
                    <CheckCircle size={12} /> Ejecutado
                  </button>
                  <button
                    onClick={() => run(() => eliminarPlan(p.id))}
                    disabled={isPending}
                    className="text-xs font-bold px-3 py-1.5 rounded transition"
                    style={{ color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Checklist de tareas */}
              {showTareas && p.tareas.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--n-border)' }}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--n-text-lt)' }}>Tareas del plan</p>
                  <ul className="space-y-1">
                    {p.tareas.map(t => (
                      <li key={t.id} className="flex items-center gap-2 text-sm py-1" style={{ borderBottom: '1px solid var(--n-border)' }}>
                        <span className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                          style={{ borderColor: t.obligatorio ? 'var(--n-yellow)' : 'var(--n-border)' }}>
                          {t.obligatorio && <span style={{ color: 'var(--n-yellow)', fontSize: 9 }}>●</span>}
                        </span>
                        <span className="text-white flex-1">{t.descripcion}</span>
                        {t.codigo && <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--n-bg)', color: 'var(--n-text-mid)' }}>{t.codigo}</span>}
                        {t.cantidad != null && <span className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>{t.cantidad} {t.unidad || 'un'}</span>}
                        {!t.obligatorio && <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>(opcional)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Historial de ejecuciones */}
              {showHistory && p.ejecuciones.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--n-border)' }}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--n-text-lt)' }}>Últimas ejecuciones</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {['Fecha', 'Horóm.', 'Km', 'Obs.', 'Usuario'].map(h => (
                          <th key={h} className="text-left pb-1 font-bold uppercase tracking-wider pr-4" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.ejecuciones.map(e => (
                        <tr key={e.id}>
                          <td className="py-1 pr-4 text-white">{new Date(e.fechaEjecucion).toLocaleDateString('es-CL')}</td>
                          <td className="py-1 pr-4" style={{ color: 'var(--n-text-mid)' }}>{e.horometroAlEjecutar != null ? `${e.horometroAlEjecutar.toLocaleString()} h` : '—'}</td>
                          <td className="py-1 pr-4" style={{ color: 'var(--n-text-mid)' }}>{e.kmAlEjecutar != null ? `${e.kmAlEjecutar.toLocaleString()}` : '—'}</td>
                          <td className="py-1 pr-4" style={{ color: 'var(--n-text-lt)' }}>{e.observacion ?? '—'}</td>
                          <td className="py-1" style={{ color: 'var(--n-text-lt)' }}>{e.usuario?.nombre ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Form registrar ejecución con observación */}
              {ejecutandoId === p.id && (
                <div className="mt-4 pt-4 flex items-end gap-3" style={{ borderTop: '1px solid var(--n-border)' }}>
                  <div className="flex-1">
                    <label className="n-label">Observación (opcional)</label>
                    <input type="text" value={obsInput} onChange={e => setObsInput(e.target.value)} placeholder="Ej: Sin novedades" className="n-input text-xs" />
                  </div>
                  <button
                    onClick={() => {
                      run(() => registrarEjecucion(p.id, obsInput || undefined))
                      setEjecutandoId(null)
                      setObsInput('')
                    }}
                    disabled={isPending}
                    className="n-btn-primary"
                  >
                    Confirmar
                  </button>
                  <button onClick={() => setEjecutandoId(null)} className="n-btn-ghost"><X size={14} /></button>
                </div>
              )}

              {/* Form programar parada */}
              {programandoId === p.id && (
                <div className="mt-4 pt-4 flex items-end gap-3" style={{ borderTop: '1px solid var(--n-border)' }}>
                  <div>
                    <label className="n-label">Fecha de parada programada</label>
                    <input type="date" value={fechaInput} onChange={e => setFechaInput(e.target.value)} className="n-input w-44" />
                  </div>
                  <button
                    onClick={() => {
                      if (!fechaInput) return
                      run(() => programarParada(p.id, fechaInput))
                      setProgramandoId(null)
                      setFechaInput('')
                    }}
                    disabled={isPending || !fechaInput}
                    className="n-btn-primary"
                  >
                    Guardar
                  </button>
                  <button onClick={() => setProgramandoId(null)} className="n-btn-ghost"><X size={14} /></button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
