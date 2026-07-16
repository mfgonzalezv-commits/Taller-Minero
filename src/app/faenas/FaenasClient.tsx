'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Plus, Truck, ArrowRightLeft, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { FaenaConEquipos } from '@/actions/faenas'
import { crearFaena, trasladarEquipo } from '@/actions/faenas'

const TIPO_LABEL: Record<string, string> = {
  CAMION: 'Camión', EXCAVADORA: 'Excavadora', CARGADOR: 'Cargador',
  MOTONIVELADORA: 'Motoniveladora', RETROEXCAVADORA: 'Retroexcavadora',
  GENERADOR: 'Generador', CAMIONETA: 'Camioneta', OTRO: 'Otro',
}

export default function FaenasClient({ faenas }: { faenas: FaenaConEquipos[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [modalNueva, setModalNueva] = useState(false)
  const [traslado, setTraslado] = useState<{ equipoId: string; equipoCodigo: string; equipoNombre: string; faenaActualId: string } | null>(null)
  const [faenaDestino, setFaenaDestino] = useState('')
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>(
    Object.fromEntries(faenas.map(f => [f.id, true]))
  )

  // Form nueva faena
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const toggleExpandido = (id: string) => setExpandidos(prev => ({ ...prev, [id]: !prev[id] }))

  const guardarFaena = () => {
    if (!nombre.trim() || !codigo.trim()) { setErrorMsg('Nombre y código son requeridos'); return }
    startTransition(async () => {
      await crearFaena({ nombre: nombre.trim(), codigo: codigo.trim(), ubicacion: ubicacion.trim() || undefined })
      setModalNueva(false)
      setNombre(''); setCodigo(''); setUbicacion(''); setErrorMsg('')
      router.refresh()
    })
  }

  const confirmarTraslado = () => {
    if (!traslado || !faenaDestino) return
    startTransition(async () => {
      await trasladarEquipo(traslado.equipoId, faenaDestino)
      setTraslado(null)
      setFaenaDestino('')
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setModalNueva(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: 'var(--win-blue)', color: 'white' }}
        >
          <Plus size={15} /> Nueva faena
        </button>
      </div>

      <div className="space-y-4">
        {faenas.map(f => (
          <div key={f.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--win-card)', border: '1px solid var(--win-border)' }}>
            {/* Header faena */}
            <button
              className="w-full flex items-center gap-3 px-5 py-4 text-left"
              style={{ borderBottom: expandidos[f.id] ? '1px solid var(--win-border)' : 'none' }}
              onClick={() => toggleExpandido(f.id)}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
                style={{ backgroundColor: 'rgba(0,120,212,0.1)' }}>
                <MapPin size={16} style={{ color: 'var(--win-blue)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold" style={{ color: 'var(--win-text)' }}>{f.nombre}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                    style={{ backgroundColor: 'var(--win-bg)', color: 'var(--win-text-mid)', border: '1px solid var(--win-border)' }}>
                    {f.codigo}
                  </span>
                  {!f.activa && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                      style={{ backgroundColor: 'rgba(200,0,0,0.1)', color: '#c00' }}>INACTIVA</span>
                  )}
                </div>
                {f.ubicacion && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--win-text-lt)' }}>{f.ubicacion}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--win-text-mid)' }}>
                  <Truck size={13} /> {f.equipos.length} equipos
                </span>
                {expandidos[f.id] ? <ChevronUp size={16} style={{ color: 'var(--win-text-lt)' }} /> : <ChevronDown size={16} style={{ color: 'var(--win-text-lt)' }} />}
              </div>
            </button>

            {/* Equipos */}
            {expandidos[f.id] && (
              <div className="px-5 py-3">
                {f.equipos.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--win-text-lt)' }}>Sin equipos asignados</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {f.equipos.map(e => (
                      <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg"
                        style={{ backgroundColor: 'var(--win-bg)', border: '1px solid var(--win-border)' }}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold font-mono" style={{ color: 'var(--win-blue)' }}>{e.codigo}</span>
                            <span className="text-xs" style={{ color: 'var(--win-text-lt)' }}>{TIPO_LABEL[e.tipo] ?? e.tipo}</span>
                          </div>
                          <p className="text-xs truncate" style={{ color: 'var(--win-text)' }}>{e.nombre}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Link href={`/equipos/${e.id}`}
                            className="text-xs px-2 py-1 rounded"
                            style={{ color: 'var(--win-text-lt)', border: '1px solid var(--win-border)' }}>
                            Ver
                          </Link>
                          {faenas.length > 1 && (
                            <button
                              title="Trasladar equipo"
                              onClick={() => { setTraslado({ equipoId: e.id, equipoCodigo: e.codigo, equipoNombre: e.nombre, faenaActualId: f.id }); setFaenaDestino('') }}
                              className="p-1 rounded"
                              style={{ color: 'var(--win-text-lt)', border: '1px solid var(--win-border)' }}>
                              <ArrowRightLeft size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal nueva faena */}
      {modalNueva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-xl shadow-2xl" style={{ backgroundColor: 'var(--win-card)', border: '1px solid var(--win-border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--win-border)' }}>
              <p className="font-bold text-sm" style={{ color: 'var(--win-text)' }}>Nueva faena</p>
              <button onClick={() => { setModalNueva(false); setErrorMsg('') }} style={{ color: 'var(--win-text-lt)' }}><X size={18} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="n-label">Nombre <span style={{ color: 'red' }}>*</span></label>
                <input className="n-input mt-1" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Faena El Teniente" />
              </div>
              <div>
                <label className="n-label">Código <span style={{ color: 'red' }}>*</span></label>
                <input className="n-input mt-1 uppercase" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="Ej: FET-001" />
              </div>
              <div>
                <label className="n-label">Ubicación <span style={{ color: 'var(--win-text-lt)', fontWeight: 400 }}>(opcional)</span></label>
                <input className="n-input mt-1" value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Ej: Región de O'Higgins, Chile" />
              </div>
              {errorMsg && <p className="text-xs" style={{ color: 'red' }}>{errorMsg}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={guardarFaena} disabled={pending} className="n-btn-primary flex-1">
                  {pending ? 'Guardando...' : 'Crear faena'}
                </button>
                <button onClick={() => { setModalNueva(false); setErrorMsg('') }} className="n-btn-ghost">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal traslado */}
      {traslado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-xl shadow-2xl" style={{ backgroundColor: 'var(--win-card)', border: '1px solid var(--win-border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--win-border)' }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--win-text-lt)' }}>Trasladar equipo</p>
                <p className="text-sm font-bold" style={{ color: 'var(--win-text)' }}>{traslado.equipoCodigo} · {traslado.equipoNombre}</p>
              </div>
              <button onClick={() => setTraslado(null)} style={{ color: 'var(--win-text-lt)' }}><X size={18} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="n-label">Faena de destino</label>
                <select className="n-input mt-1" value={faenaDestino} onChange={e => setFaenaDestino(e.target.value)}>
                  <option value="">Seleccionar faena...</option>
                  {faenas.filter(f => f.id !== traslado.faenaActualId && f.activa).map(f => (
                    <option key={f.id} value={f.id}>{f.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={confirmarTraslado} disabled={pending || !faenaDestino} className="n-btn-primary flex-1">
                  {pending ? 'Trasladando...' : 'Confirmar traslado'}
                </button>
                <button onClick={() => setTraslado(null)} className="n-btn-ghost">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
