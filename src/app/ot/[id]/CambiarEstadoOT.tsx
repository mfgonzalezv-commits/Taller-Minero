'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cambiarEstadoOT } from '@/actions/ot'
import { ESTADO_OT_CONFIG } from '@/lib/constants'
import type { EstadoOT } from '@prisma/client'
import { ArrowRight } from 'lucide-react'

export default function CambiarEstadoOT({
  otId,
  transiciones,
  horizontal = false,
  advertenciaCierre,
}: {
  otId: string
  transiciones: string[]
  horizontal?: boolean
  advertenciaCierre?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [observacion, setObservacion] = useState('')
  const [mostrarObs, setMostrarObs] = useState(false)
  const [error, setError] = useState('')

  const cambiar = (nuevoEstado: EstadoOT) => {
    setError('')
    if (nuevoEstado === 'CERRADA' && advertenciaCierre) {
      if (!window.confirm(`⚠️ ${advertenciaCierre}\n\n¿Cerrar igual?`)) return
    }
    startTransition(async () => {
      try {
        await cambiarEstadoOT(otId, nuevoEstado, observacion || undefined)
        setObservacion('')
        setMostrarObs(false)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al cambiar estado')
      }
    })
  }

  if (horizontal) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {transiciones.map(estado => {
          const cfg = ESTADO_OT_CONFIG[estado as EstadoOT]
          return (
            <button
              key={estado}
              onClick={() => cambiar(estado as EstadoOT)}
              disabled={isPending}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 hover:opacity-80 ${cfg.color}`}
            >
              <ArrowRight size={12} />
              {cfg.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMostrarObs(v => !v)}
          className="text-xs px-2 py-1.5 rounded-md transition"
          style={{ color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' }}
        >
          {mostrarObs ? 'Sin obs.' : '+ Obs.'}
        </button>
        {mostrarObs && (
          <input
            type="text"
            value={observacion}
            onChange={e => setObservacion(e.target.value)}
            placeholder="Observación al cambiar estado..."
            className="n-input flex-1 min-w-[200px] text-xs py-1.5"
          />
        )}
        {error && <p className="w-full text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div className="n-card space-y-3">
      <p className="n-label">Cambiar estado</p>
      <textarea
        value={observacion}
        onChange={e => setObservacion(e.target.value)}
        rows={2}
        placeholder="Observación (opcional)"
        className="n-input resize-none"
      />
      <div className="space-y-2">
        {transiciones.map(estado => {
          const cfg = ESTADO_OT_CONFIG[estado as EstadoOT]
          return (
            <button
              key={estado}
              onClick={() => cambiar(estado as EstadoOT)}
              disabled={isPending}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold text-left transition disabled:opacity-50 hover:opacity-80 ${cfg.color}`}
            >
              <ArrowRight size={13} />
              {cfg.label}
            </button>
          )
        })}
      </div>
      {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}
    </div>
  )
}
