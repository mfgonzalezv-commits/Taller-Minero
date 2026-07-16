'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearPlan } from '@/actions/mantenimiento'
import { Plus, X } from 'lucide-react'

type Equipo = { id: string; codigo: string; nombre: string }
type Ciclo  = { id: string; nombre: string; equipoId: string }

export default function NuevoPlanForm({ equipos, ciclos }: { equipos: Equipo[]; ciclos: Ciclo[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const [equipoId, setEquipoId] = useState('')
  const [cicloId, setCicloId] = useState('')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [intervaloHoras, setIntervaloHoras] = useState('')
  const [intervaloKm, setIntervaloKm] = useState('')
  const [intervaloDias, setIntervaloDias] = useState('')
  const [tareas, setTareas] = useState<{ descripcion: string; obligatorio: boolean }[]>([])
  const [nuevaTarea, setNuevaTarea] = useState('')

  const ciclosFiltrados = ciclos.filter(c => !equipoId || c.equipoId === equipoId)

  const agregarTarea = () => {
    if (!nuevaTarea.trim()) return
    setTareas(t => [...t, { descripcion: nuevaTarea.trim(), obligatorio: true }])
    setNuevaTarea('')
  }

  const quitarTarea = (i: number) => setTareas(t => t.filter((_, idx) => idx !== i))

  const toggleObligatorio = (i: number) =>
    setTareas(t => t.map((x, idx) => idx === i ? { ...x, obligatorio: !x.obligatorio } : x))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk(false)
    startTransition(async () => {
      try {
        await crearPlan({
          equipoId,
          cicloId: cicloId || undefined,
          nombre,
          descripcion: descripcion || undefined,
          intervaloHoras: intervaloHoras ? Number(intervaloHoras) : undefined,
          intervaloKm: intervaloKm ? Number(intervaloKm) : undefined,
          intervaloDias: intervaloDias ? Number(intervaloDias) : undefined,
          tareas: tareas.length ? tareas : undefined,
        })
        setNombre(''); setDescripcion('')
        setIntervaloHoras(''); setIntervaloKm(''); setIntervaloDias('')
        setEquipoId(''); setCicloId(''); setTareas([])
        setOk(true)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear plan')
      }
    })
  }

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <div className="flex items-center gap-2 mb-5" style={{ borderBottom: '1px solid var(--n-border)', paddingBottom: '1rem' }}>
        <Plus size={14} style={{ color: 'var(--n-yellow)' }} />
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Nuevo plan</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="n-label">Equipo *</label>
          <select value={equipoId} onChange={e => { setEquipoId(e.target.value); setCicloId('') }} required className="n-input">
            <option value="">Seleccionar...</option>
            {equipos.map(e => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
          </select>
        </div>

        {equipoId && ciclosFiltrados.length > 0 && (
          <div>
            <label className="n-label">Ciclo (opcional)</label>
            <select value={cicloId} onChange={e => setCicloId(e.target.value)} className="n-input">
              <option value="">Sin ciclo</option>
              {ciclosFiltrados.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="n-label">Nombre del plan *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="PM500 — Cambio aceite motor" className="n-input" />
        </div>
        <div>
          <label className="n-label">Descripción</label>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} className="n-input resize-none" />
        </div>

        <div>
          <p className="n-label mb-2">Intervalo (al menos uno)</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Horas</label>
              <input type="number" value={intervaloHoras} onChange={e => setIntervaloHoras(e.target.value)} min="1" placeholder="500" className="n-input" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Km</label>
              <input type="number" value={intervaloKm} onChange={e => setIntervaloKm(e.target.value)} min="1" placeholder="5000" className="n-input" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Días</label>
              <input type="number" value={intervaloDias} onChange={e => setIntervaloDias(e.target.value)} min="1" placeholder="30" className="n-input" />
            </div>
          </div>
        </div>

        {/* Tareas / checklist */}
        <div>
          <p className="n-label mb-2">Tareas del plan</p>
          {tareas.length > 0 && (
            <ul className="space-y-1 mb-2">
              {tareas.map((t, i) => (
                <li key={i} className="flex items-center gap-2 text-xs rounded px-2 py-1.5" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
                  <button type="button" onClick={() => toggleObligatorio(i)}
                    className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                    style={{ borderColor: t.obligatorio ? 'var(--n-yellow)' : 'var(--n-border)', backgroundColor: t.obligatorio ? 'rgba(255,209,0,0.15)' : 'transparent' }}
                    title={t.obligatorio ? 'Obligatoria' : 'Opcional'}
                  >
                    {t.obligatorio && <span style={{ color: 'var(--n-yellow)', fontSize: 8 }}>✓</span>}
                  </button>
                  <span className="flex-1 text-white">{t.descripcion}</span>
                  <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{t.obligatorio ? 'oblig.' : 'opc.'}</span>
                  <button type="button" onClick={() => quitarTarea(i)} style={{ color: 'var(--n-text-lt)' }}><X size={11} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevaTarea}
              onChange={e => setNuevaTarea(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarTarea() } }}
              placeholder="Ej: Cambiar filtro aceite"
              className="n-input flex-1 text-xs"
            />
            <button type="button" onClick={agregarTarea} className="n-btn-ghost text-xs px-2">+ Agregar</button>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--n-text-lt)' }}>El checkbox amarillo marca la tarea como obligatoria</p>
        </div>

        {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
        {ok && <p className="text-xs" style={{ color: '#4ade80' }}>Plan creado correctamente</p>}
        <button type="submit" disabled={isPending} className="n-btn-primary w-full">
          {isPending ? 'Guardando...' : 'Crear plan'}
        </button>
      </form>
    </div>
  )
}
