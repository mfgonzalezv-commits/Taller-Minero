'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { crearInspeccion } from '@/actions/inspeccion'
import { CheckCircle, AlertTriangle, AlertOctagon, Info, ChevronDown, ChevronUp } from 'lucide-react'

type Item = {
  id: string
  categoria: string
  descripcion: string
  criticidadBase: string
}

type Plantilla = {
  id: string
  nombre: string
  equipoId: string | null
  items: Item[]
}

type Equipo = { id: string; codigo: string; nombre: string }

const RESULTADO_CONFIG = {
  OK:          { label: 'OK',          icon: CheckCircle,    color: '#4ade80',           bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.4)' },
  OBSERVACION: { label: 'Observación', icon: Info,           color: 'var(--n-yellow)',   bg: 'rgba(255,209,0,0.15)',  border: 'rgba(255,209,0,0.4)' },
  ALERTA:      { label: 'Alerta',      icon: AlertTriangle,  color: '#f97316',           bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)' },
  CRITICO:     { label: 'Crítico',     icon: AlertOctagon,   color: 'var(--n-red)',      bg: 'rgba(229,9,20,0.15)',   border: 'rgba(229,9,20,0.4)' },
}

type ResultadoKey = keyof typeof RESULTADO_CONFIG

export default function InspeccionForm({
  equipos,
  plantillas,
}: {
  equipos: Equipo[]
  plantillas: Plantilla[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [equipoId, setEquipoId] = useState('')
  const [plantillaId, setPlantillaId] = useState('')
  const [turno, setTurno] = useState<'MAÑANA' | 'TARDE' | 'NOCHE'>('MAÑANA')
  const [observacion, setObservacion] = useState('')
  const [resultados, setResultados] = useState<Record<string, { resultado: ResultadoKey; obs: string }>>({})
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState<{ alertas: number } | null>(null)

  const plantillasFiltradas = useMemo(() =>
    plantillas.filter(p => !p.equipoId || p.equipoId === equipoId),
    [plantillas, equipoId]
  )

  const plantillaActual = plantillas.find(p => p.id === plantillaId)

  const categorias = useMemo(() => {
    if (!plantillaActual) return []
    const cats = [...new Set(plantillaActual.items.map(i => i.categoria))]
    return cats.map(cat => ({
      nombre: cat,
      items: plantillaActual.items.filter(i => i.categoria === cat),
    }))
  }, [plantillaActual])

  // Abrir primera categoría automáticamente
  const firstCat = categorias[0]?.nombre
  const catAbierta = categoriaAbierta ?? firstCat

  const setResultado = (itemId: string, resultado: ResultadoKey) => {
    setResultados(r => ({ ...r, [itemId]: { resultado, obs: r[itemId]?.obs ?? '' } }))
  }
  const setObs = (itemId: string, obs: string) => {
    setResultados(r => ({ ...r, [itemId]: { resultado: r[itemId]?.resultado ?? 'OK', obs } }))
  }

  const progreso = plantillaActual
    ? Object.keys(resultados).filter(id => plantillaActual.items.some(i => i.id === id)).length
    : 0
  const total = plantillaActual?.items.length ?? 0
  const conProblemas = Object.values(resultados).filter(r => r.resultado !== 'OK').length

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!equipoId || !plantillaId) return setError('Selecciona equipo y plantilla')
    if (progreso < total) return setError(`Faltan ${total - progreso} ítems por revisar`)

    startTransition(async () => {
      try {
        const res = await crearInspeccion({
          equipoId,
          plantillaId,
          turno,
          observacion: observacion || undefined,
          resultados: Object.entries(resultados).map(([itemId, r]) => ({
            itemId,
            resultado: r.resultado,
            observacion: r.obs || undefined,
          })),
        })
        setOk({ alertas: res.alertas })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al guardar inspección')
      }
    })
  }

  if (ok) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <CheckCircle size={40} className="mx-auto mb-3" style={{ color: '#4ade80' }} />
        <p className="text-xl font-black text-white">Inspección registrada</p>
        {ok.alertas > 0 ? (
          <p className="text-sm mt-2 font-medium" style={{ color: 'var(--n-yellow)' }}>
            Se generaron {ok.alertas} alerta{ok.alertas > 1 ? 's' : ''} para revisión
          </p>
        ) : (
          <p className="text-sm mt-2" style={{ color: '#4ade80' }}>Sin fallas — equipo en buen estado</p>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <button onClick={() => router.push('/inspeccion')}
            className="n-btn-primary">Ver alertas</button>
          <button onClick={() => { setOk(null); setResultados({}); setEquipoId(''); setPlantillaId('') }}
            className="n-btn-ghost">Nueva inspección</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Selección equipo / plantilla / turno */}
      <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="n-label">Equipo *</label>
            <select value={equipoId} onChange={e => { setEquipoId(e.target.value); setPlantillaId(''); setResultados({}) }} required className="n-input">
              <option value="">Seleccionar...</option>
              {equipos.map(e => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="n-label">Plantilla *</label>
            <select value={plantillaId} onChange={e => { setPlantillaId(e.target.value); setResultados({}) }} required className="n-input" disabled={!equipoId}>
              <option value="">Seleccionar...</option>
              {plantillasFiltradas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="n-label">Turno *</label>
            <select value={turno} onChange={e => setTurno(e.target.value as typeof turno)} required className="n-input">
              <option value="MAÑANA">🌅 Mañana</option>
              <option value="TARDE">☀️ Tarde</option>
              <option value="NOCHE">🌙 Noche</option>
            </select>
          </div>
        </div>
      </div>

      {/* Checklist por categoría */}
      {plantillaActual && categorias.length > 0 && (
        <>
          {/* Barra de progreso */}
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>
                Progreso {progreso}/{total}
              </p>
              {conProblemas > 0 && (
                <p className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
                  {conProblemas} con observación/alerta
                </p>
              )}
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--n-bg)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${total > 0 ? (progreso / total) * 100 : 0}%`, backgroundColor: progreso === total ? '#4ade80' : 'var(--n-yellow)' }} />
            </div>
          </div>

          {/* Categorías */}
          {categorias.map(cat => {
            const abierta = catAbierta === cat.nombre
            const itemsCat = cat.items
            const completadosCat = itemsCat.filter(i => resultados[i.id]).length
            const problemaCat = itemsCat.some(i => resultados[i.id]?.resultado !== 'OK' && resultados[i.id])

            return (
              <div key={cat.nombre} className="rounded-xl overflow-hidden"
                style={{ backgroundColor: 'var(--n-surface)', border: `1px solid ${problemaCat ? 'var(--n-yellow)' : 'var(--n-border)'}` }}>
                <button type="button"
                  onClick={() => setCategoriaAbierta(abierta ? null : cat.nombre)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    {problemaCat && <AlertTriangle size={13} style={{ color: 'var(--n-yellow)' }} />}
                    <p className="text-sm font-bold text-white">{cat.nombre}</p>
                    <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{completadosCat}/{itemsCat.length}</span>
                  </div>
                  {abierta ? <ChevronUp size={14} style={{ color: 'var(--n-text-lt)' }} /> : <ChevronDown size={14} style={{ color: 'var(--n-text-lt)' }} />}
                </button>

                {abierta && (
                  <div style={{ borderTop: '1px solid var(--n-border)' }}>
                    {itemsCat.map((item, idx) => {
                      const r = resultados[item.id]?.resultado ?? null
                      const obsVal = resultados[item.id]?.obs ?? ''
                      return (
                        <div key={item.id} className="px-5 py-4" style={{ borderBottom: idx < itemsCat.length - 1 ? '1px solid var(--n-border)' : undefined }}>
                          <p className="text-sm font-medium text-white mb-3">{item.descripcion}</p>
                          {/* Botones resultado */}
                          <div className="flex gap-2 flex-wrap">
                            {(Object.keys(RESULTADO_CONFIG) as ResultadoKey[]).map(key => {
                              const cfg = RESULTADO_CONFIG[key]
                              const Icon = cfg.icon
                              const selected = r === key
                              return (
                                <button key={key} type="button"
                                  onClick={() => setResultado(item.id, key)}
                                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition-all"
                                  style={{
                                    backgroundColor: selected ? cfg.bg : 'var(--n-bg)',
                                    color: selected ? cfg.color : 'var(--n-text-lt)',
                                    border: `1px solid ${selected ? cfg.border : 'var(--n-border)'}`,
                                  }}
                                >
                                  <Icon size={11} /> {cfg.label}
                                </button>
                              )
                            })}
                          </div>
                          {/* Observación si no es OK */}
                          {r && r !== 'OK' && (
                            <input
                              type="text"
                              value={obsVal}
                              onChange={e => setObs(item.id, e.target.value)}
                              placeholder="Describe la situación..."
                              className="n-input mt-2 text-xs"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Observación general */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <label className="n-label">Observación general</label>
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={2} className="n-input resize-none" placeholder="Comentarios adicionales..." />
          </div>
        </>
      )}

      {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}

      {plantillaActual && (
        <button type="submit" disabled={isPending || progreso < total} className="n-btn-primary w-full">
          {isPending ? 'Guardando...' : progreso < total ? `Faltan ${total - progreso} ítems` : 'Finalizar inspección'}
        </button>
      )}
    </form>
  )
}
