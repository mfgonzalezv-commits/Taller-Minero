'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { programarPM } from '@/actions/pautas'
import { Calendar, X, ClipboardList } from 'lucide-react'

export default function ProgramarPMModal({
  equipoId,
  equipoCodigo,
  pautaId,
  pautaNombre,
  ciclosDisponibles,
  unidad,
  cicloSugerido,
}: {
  equipoId: string
  equipoCodigo: string
  pautaId: string
  pautaNombre: string
  ciclosDisponibles: number[]
  unidad: 'HRS' | 'KM'
  cicloSugerido: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ciclo, setCiclo] = useState(cicloSugerido)
  const [fecha, setFecha] = useState('')
  const [observacion, setObservacion] = useState('')
  const [pending, startTransition] = useTransition()
  const [otId, setOtId] = useState<string | null>(null)

  const hoy = new Date().toISOString().split('T')[0]

  const confirmar = () => {
    if (!fecha) return
    startTransition(async () => {
      const id = await programarPM({ equipoId, pautaId, ciclo, fechaPlanificada: fecha, observacion: observacion || undefined })
      setOtId(id)
    })
  }

  const irAOT = () => {
    if (otId) router.push(`/ot/${otId}`)
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
        style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
      >
        <Calendar size={12} /> Programar
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-xl overflow-hidden shadow-2xl" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--n-text-lt)' }}>Programar PM</p>
                <p className="text-sm font-bold text-white">{equipoCodigo} · {pautaNombre}</p>
              </div>
              <button onClick={() => { setAbierto(false); setOtId(null) }} style={{ color: 'var(--n-text-lt)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Contenido */}
            <div className="px-5 py-5 space-y-4">

              {otId ? (
                /* Éxito */
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: 'rgba(74,222,128,0.15)' }}>
                    <ClipboardList size={22} style={{ color: '#4ade80' }} />
                  </div>
                  <div>
                    <p className="font-bold text-white">PM programada</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--n-text-lt)' }}>
                      OT creada en estado PROGRAMADA con el checklist de {ciclo.toLocaleString()} {unidad.toLowerCase()} completo.
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--n-text-lt)' }}>
                      Fecha comprometida: <strong className="text-white">{new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL')}</strong>
                    </p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={irAOT}
                      className="n-btn-primary"
                    >
                      Ver OT generada
                    </button>
                    <button
                      onClick={() => { setAbierto(false); setOtId(null); router.refresh() }}
                      className="n-btn-ghost"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : (
                /* Formulario */
                <>
                  {/* Ciclo */}
                  <div>
                    <label className="n-label">Ciclo a ejecutar</label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {ciclosDisponibles.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCiclo(c)}
                          className="rounded-lg px-3 py-1.5 text-xs font-bold transition"
                          style={{
                            backgroundColor: ciclo === c ? 'var(--n-yellow)' : 'var(--n-bg)',
                            color: ciclo === c ? '#1A1A1A' : 'var(--n-text-mid)',
                            border: `1px solid ${ciclo === c ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                          }}
                        >
                          {c.toLocaleString()} {unidad.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fecha */}
                  <div>
                    <label className="n-label">Fecha planificada de ejecución <span style={{ color: 'var(--n-red)' }}>*</span></label>
                    <input
                      type="date"
                      value={fecha}
                      min={hoy}
                      onChange={e => setFecha(e.target.value)}
                      className="n-input mt-1"
                    />
                  </div>

                  {/* Observación */}
                  <div>
                    <label className="n-label">Observación <span style={{ color: 'var(--n-text-lt)', fontWeight: 400 }}>(opcional)</span></label>
                    <input
                      type="text"
                      value={observacion}
                      onChange={e => setObservacion(e.target.value)}
                      placeholder="Ej: Esperar llegada de filtros, coordinar con operador..."
                      className="n-input mt-1 text-sm"
                    />
                  </div>

                  <div className="rounded-lg px-3 py-2.5 text-xs" style={{ backgroundColor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                    Se creará una OT en estado <strong>PROGRAMADA</strong> con el checklist completo del ciclo {ciclo.toLocaleString()} {unidad.toLowerCase()}.
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={confirmar}
                      disabled={pending || !fecha}
                      className="n-btn-primary flex-1"
                    >
                      {pending ? 'Creando OT...' : 'Confirmar programación'}
                    </button>
                    <button onClick={() => setAbierto(false)} className="n-btn-ghost">
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
