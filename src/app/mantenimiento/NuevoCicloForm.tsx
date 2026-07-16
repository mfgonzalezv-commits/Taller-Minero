'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearCiclo, eliminarCiclo } from '@/actions/mantenimiento'
import { RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react'

type Equipo = { id: string; codigo: string; nombre: string }
type Ciclo  = { id: string; nombre: string; descripcion: string | null; equipo: { codigo: string; nombre: string }; planes: { id: string; nombre: string; intervaloHoras: number | null; intervaloKm: number | null; intervaloDias: number | null; tareas: unknown[] }[] }

export default function NuevoCicloForm({ equipos, ciclos }: { equipos: Equipo[]; ciclos: Ciclo[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [equipoId, setEquipoId] = useState('')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const run = (fn: () => Promise<unknown>) => {
    startTransition(async () => { await fn(); router.refresh() })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setOk(false)
    startTransition(async () => {
      try {
        await crearCiclo({ equipoId, nombre, descripcion: descripcion || undefined })
        setEquipoId(''); setNombre(''); setDescripcion('')
        setOk(true)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear ciclo')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Ciclos existentes */}
      {ciclos.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Ciclos activos ({ciclos.length})</p>
          </div>
          {ciclos.map(c => (
            <div key={c.id} style={{ borderBottom: '1px solid var(--n-border)' }}>
              <div className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={12} style={{ color: 'var(--n-yellow)' }} />
                    <span className="text-sm font-bold text-white">{c.nombre}</span>
                    <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{c.equipo.codigo}</span>
                  </div>
                  {c.descripcion && <p className="text-xs mt-0.5 ml-5" style={{ color: 'var(--n-text-lt)' }}>{c.descripcion}</p>}
                  <p className="text-xs mt-0.5 ml-5" style={{ color: 'var(--n-text-lt)' }}>{c.planes.length} plan{c.planes.length !== 1 ? 'es' : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.planes.length > 0 && (
                    <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} style={{ color: 'var(--n-text-lt)' }}>
                      {expandedId === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                  <button onClick={() => run(() => eliminarCiclo(c.id))} disabled={isPending} style={{ color: 'var(--n-text-lt)' }}>
                    <X size={13} />
                  </button>
                </div>
              </div>
              {expandedId === c.id && c.planes.length > 0 && (
                <div className="px-5 pb-3">
                  {c.planes.map(p => (
                    <div key={p.id} className="text-xs py-1 flex items-center gap-3" style={{ borderTop: '1px solid var(--n-border)' }}>
                      <span className="text-white font-medium">{p.nombre}</span>
                      {p.intervaloHoras && <span style={{ color: 'var(--n-text-lt)' }}>{p.intervaloHoras}h</span>}
                      {p.intervaloKm && <span style={{ color: 'var(--n-text-lt)' }}>{p.intervaloKm.toLocaleString()}km</span>}
                      {p.intervaloDias && <span style={{ color: 'var(--n-text-lt)' }}>{p.intervaloDias}d</span>}
                      {(p.tareas as unknown[]).length > 0 && <span style={{ color: 'var(--n-text-lt)' }}>· {(p.tareas as unknown[]).length} tareas</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form nuevo ciclo */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div className="flex items-center gap-2 mb-5" style={{ borderBottom: '1px solid var(--n-border)', paddingBottom: '1rem' }}>
          <RefreshCw size={14} style={{ color: 'var(--n-yellow)' }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Nuevo ciclo</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="n-label">Equipo *</label>
            <select value={equipoId} onChange={e => setEquipoId(e.target.value)} required className="n-input">
              <option value="">Seleccionar...</option>
              {equipos.map(e => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="n-label">Nombre del ciclo *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Ej: PM Camión CAT 797" className="n-input" />
          </div>
          <div>
            <label className="n-label">Descripción</label>
            <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Opcional" className="n-input" />
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
          {ok && <p className="text-xs" style={{ color: '#4ade80' }}>Ciclo creado. Ahora crea planes dentro de él.</p>}
          <button type="submit" disabled={isPending} className="n-btn-primary w-full">
            {isPending ? 'Guardando...' : 'Crear ciclo'}
          </button>
        </form>
      </div>
    </div>
  )
}
