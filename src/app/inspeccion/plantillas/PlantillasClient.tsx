'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearPlantilla, eliminarPlantilla } from '@/actions/inspeccion'
import { Plus, X, ChevronDown, ChevronUp, AlertTriangle, AlertOctagon, Info } from 'lucide-react'

type Equipo = { id: string; codigo: string; nombre: string }

type ItemForm = { categoria: string; descripcion: string; criticidadBase: 'INFORMATIVO' | 'OBSERVACION' | 'ALERTA' | 'CRITICO' }

type Plantilla = {
  id: string
  nombre: string
  equipoId: string | null
  equipo: { codigo: string; nombre: string } | null
  items: { id: string; categoria: string; descripcion: string; criticidadBase: string }[]
}

const CATEGORIAS_SUGERIDAS = [
  'Motor', 'Frenos', 'Hidráulico', 'Neumáticos', 'Eléctrico',
  'Cabina', 'Luces', 'Aceites y Fluidos', 'Seguridad', 'Carrocería',
]

const CRITICIDAD_ICON: Record<string, React.ReactNode> = {
  INFORMATIVO: <Info size={11} className="inline mr-1" />,
  OBSERVACION: <AlertTriangle size={11} className="inline mr-1" style={{ color: 'var(--n-yellow)' }} />,
  ALERTA:      <AlertTriangle size={11} className="inline mr-1" style={{ color: '#f97316' }} />,
  CRITICO:     <AlertOctagon size={11} className="inline mr-1" style={{ color: 'var(--n-red)' }} />,
}

export default function PlantillasClient({ equipos, plantillas }: { equipos: Equipo[]; plantillas: Plantilla[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Form estado
  const [equipoId, setEquipoId] = useState('')
  const [nombre, setNombre] = useState('')
  const [items, setItems] = useState<ItemForm[]>([])
  const [catNueva, setCatNueva] = useState('')
  const [descNueva, setDescNueva] = useState('')
  const [criticidadNueva, setCriticidadNueva] = useState<ItemForm['criticidadBase']>('INFORMATIVO')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const agregarItem = () => {
    if (!catNueva.trim() || !descNueva.trim()) return
    setItems(i => [...i, { categoria: catNueva.trim(), descripcion: descNueva.trim(), criticidadBase: criticidadNueva }])
    setDescNueva('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setOk(false)
    if (!items.length) return setError('Agrega al menos un ítem al checklist')
    startTransition(async () => {
      try {
        await crearPlantilla({
          equipoId: equipoId || undefined,
          nombre,
          items: items.map((item, i) => ({ ...item, orden: i })),
        })
        setNombre(''); setEquipoId(''); setItems([])
        setOk(true)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear plantilla')
      }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Plantillas existentes */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>
          Plantillas activas ({plantillas.length})
        </p>
        {plantillas.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}>
            <p className="text-sm">No hay plantillas. Crea la primera.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plantillas.map(p => (
              <div key={p.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
                <div className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{p.nombre}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>
                      {p.equipo ? `${p.equipo.codigo} · ` : 'General · '}{p.items.length} ítems
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} style={{ color: 'var(--n-text-lt)' }}>
                      {expandedId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => startTransition(async () => { await eliminarPlantilla(p.id); router.refresh() })} disabled={isPending} style={{ color: 'var(--n-text-lt)' }}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
                {expandedId === p.id && (
                  <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--n-border)' }}>
                    {[...new Set(p.items.map(i => i.categoria))].map(cat => (
                      <div key={cat} className="mt-3">
                        <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--n-yellow)' }}>{cat}</p>
                        {p.items.filter(i => i.categoria === cat).map(item => (
                          <div key={item.id} className="flex items-center gap-2 text-xs py-1">
                            {CRITICIDAD_ICON[item.criticidadBase]}
                            <span className="text-white">{item.descripcion}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formulario nueva plantilla */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>Nueva plantilla</p>
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Nombre *</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Inspección diaria camión" className="n-input" />
              </div>
              <div>
                <label className="n-label">Equipo (opcional)</label>
                <select value={equipoId} onChange={e => setEquipoId(e.target.value)} className="n-input">
                  <option value="">Todos los equipos</option>
                  {equipos.map(e => <option key={e.id} value={e.id}>{e.codigo}</option>)}
                </select>
              </div>
            </div>

            {/* Ítems ya agregados */}
            {items.length > 0 && (
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--n-border)' }}>
                {[...new Set(items.map(i => i.categoria))].map(cat => (
                  <div key={cat}>
                    <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: 'var(--n-bg)', color: 'var(--n-yellow)', borderBottom: '1px solid var(--n-border)' }}>
                      {cat}
                    </div>
                    {items.filter(i => i.categoria === cat).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-2 text-xs" style={{ borderBottom: '1px solid var(--n-border)' }}>
                        {CRITICIDAD_ICON[item.criticidadBase]}
                        <span className="flex-1 text-white">{item.descripcion}</span>
                        <button type="button" onClick={() => setItems(i => i.filter((_, j) => !(i[j].categoria === item.categoria && i[j].descripcion === item.descripcion)))} style={{ color: 'var(--n-text-lt)' }}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Agregar ítem */}
            <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--n-text-lt)' }}>Agregar ítem</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Categoría</label>
                  <input type="text" value={catNueva} onChange={e => setCatNueva(e.target.value)} list="categorias" placeholder="Motor" className="n-input text-xs" />
                  <datalist id="categorias">
                    {CATEGORIAS_SUGERIDAS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Criticidad si falla</label>
                  <select value={criticidadNueva} onChange={e => setCriticidadNueva(e.target.value as ItemForm['criticidadBase'])} className="n-input text-xs">
                    <option value="INFORMATIVO">Informativo</option>
                    <option value="OBSERVACION">Observación</option>
                    <option value="ALERTA">Alerta</option>
                    <option value="CRITICO">Crítico</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={descNueva}
                  onChange={e => setDescNueva(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarItem() } }}
                  placeholder="Ej: Nivel aceite motor"
                  className="n-input flex-1 text-xs"
                />
                <button type="button" onClick={agregarItem} className="n-btn-ghost text-xs px-2">
                  <Plus size={13} />
                </button>
              </div>
            </div>

            {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
            {ok && <p className="text-xs" style={{ color: '#4ade80' }}>Plantilla creada correctamente</p>}
            <button type="submit" disabled={isPending} className="n-btn-primary w-full">
              {isPending ? 'Guardando...' : `Crear plantilla (${items.length} ítems)`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
