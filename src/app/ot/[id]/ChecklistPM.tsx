'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarChecklistItem } from '@/actions/pautas'
import { ClipboardList, RotateCcw, Search, CheckCircle2, MinusCircle, AlertCircle } from 'lucide-react'

type Item = {
  id: string
  descripcion: string
  codigo: string | null
  cantidad: number | null
  unidad: string | null
  obligatorio: boolean
  completado: boolean
  resultado: string | null
  observacion: string | null
  orden: number
}

const RESULTADO_CONFIG = {
  OK:          { label: 'OK',    color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: CheckCircle2 },
  NA:          { label: 'N/A',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: MinusCircle },
  OBSERVACION: { label: 'OBS',   color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: AlertCircle },
} as const

function ItemRow({
  item,
  editable,
  onMark,
}: {
  item: Item
  editable: boolean
  onMark: (id: string, resultado: 'OK' | 'NA' | 'OBSERVACION', obs?: string) => Promise<void>
}) {
  const [showObs, setShowObs] = useState(false)
  const [obs, setObs] = useState(item.observacion ?? '')
  const [pending, startTransition] = useTransition()

  const esReemplazo = item.descripcion.startsWith('🔄')
  const esRevision  = item.descripcion.startsWith('🔍')
  const descripcionLimpia = item.descripcion.replace(/^[🔄🔍]\s*/, '')

  const marcar = (resultado: 'OK' | 'NA' | 'OBSERVACION') => {
    if (!editable) return
    if (resultado === 'OBSERVACION') { setShowObs(true); return }
    startTransition(async () => {
      await onMark(item.id, resultado)
    })
  }

  const guardarObs = () => {
    startTransition(async () => {
      await onMark(item.id, 'OBSERVACION', obs)
      setShowObs(false)
    })
  }

  const res = item.resultado as keyof typeof RESULTADO_CONFIG | null
  const cfg = res ? RESULTADO_CONFIG[res] : null

  return (
    <div
      className="px-4 py-3 transition-colors"
      style={{
        borderBottom: '1px solid var(--n-border)',
        backgroundColor: cfg ? cfg.bg : undefined,
        opacity: res === 'NA' ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Indicador tipo */}
        <div className="mt-0.5 shrink-0">
          {esReemplazo && <RotateCcw size={14} style={{ color: '#4ade80' }} />}
          {esRevision  && <Search size={14} style={{ color: '#fbbf24' }} />}
          {!esReemplazo && !esRevision && <div className="w-3.5 h-3.5" />}
        </div>

        {/* Descripción */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{descripcionLimpia}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.codigo && (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--n-bg)', color: 'var(--n-text-mid)' }}>
                {item.codigo}
              </span>
            )}
            {item.cantidad != null && (
              <span className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
                {item.cantidad} {item.unidad || 'un'}
              </span>
            )}
            <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{
              backgroundColor: esReemplazo ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)',
              color: esReemplazo ? '#4ade80' : '#fbbf24',
            }}>
              {esReemplazo ? 'CAMBIAR' : 'REVISAR'}
            </span>
          </div>
          {item.observacion && (
            <p className="text-xs mt-1 italic" style={{ color: '#f97316' }}>Obs: {item.observacion}</p>
          )}
          {showObs && (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                type="text"
                value={obs}
                onChange={e => setObs(e.target.value)}
                placeholder="Describe la observación..."
                className="n-input text-xs flex-1 py-1"
                onKeyDown={e => e.key === 'Enter' && guardarObs()}
              />
              <button onClick={guardarObs} disabled={pending || !obs.trim()} className="n-btn-primary px-3 py-1 text-xs">
                {pending ? '...' : 'Guardar'}
              </button>
              <button onClick={() => setShowObs(false)} className="n-btn-ghost px-2 py-1 text-xs">✕</button>
            </div>
          )}
        </div>

        {/* Botones de resultado */}
        {editable && !showObs && (
          <div className="flex gap-1 shrink-0">
            {(['OK', 'NA', 'OBSERVACION'] as const).map(r => {
              const c = RESULTADO_CONFIG[r]
              const Icon = c.icon
              const isActive = res === r
              return (
                <button
                  key={r}
                  onClick={() => marcar(r)}
                  disabled={pending}
                  title={c.label}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-bold transition"
                  style={{
                    backgroundColor: isActive ? c.bg : 'var(--n-bg)',
                    color: isActive ? c.color : 'var(--n-text-lt)',
                    border: `1px solid ${isActive ? c.color : 'var(--n-border)'}`,
                  }}
                >
                  <Icon size={11} />
                  {c.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Badge resultado (no editable) */}
        {!editable && cfg && (
          <span className="text-xs font-bold px-2 py-1 rounded shrink-0" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
            {cfg.label}
          </span>
        )}
      </div>
    </div>
  )
}

export default function ChecklistPM({
  otId,
  items,
  cicloPM,
  editable,
}: {
  otId: string
  items: Item[]
  cicloPM: number | null
  editable: boolean
}) {
  const router = useRouter()

  const completados = items.filter(i => i.resultado === 'OK' || i.resultado === 'NA').length
  const conObservacion = items.filter(i => i.resultado === 'OBSERVACION').length
  const porcentaje = items.length > 0 ? Math.round((completados / items.length) * 100) : 0
  const todoListo = completados + conObservacion === items.length

  const handleMark = async (id: string, resultado: 'OK' | 'NA' | 'OBSERVACION', obs?: string) => {
    await marcarChecklistItem(id, resultado, obs)
    router.refresh()
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} color="var(--n-yellow)" />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              Checklist PM{cicloPM ? ` · ${cicloPM.toLocaleString()}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {conObservacion > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(249,115,22,0.15)', color: '#f97316' }}>
                {conObservacion} obs
              </span>
            )}
            <span className="text-xs font-bold" style={{ color: todoListo ? '#4ade80' : 'var(--n-text-lt)' }}>
              {completados}/{items.length} · {porcentaje}%
            </span>
          </div>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--n-bg)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${porcentaje}%`,
              backgroundColor: todoListo ? '#4ade80' : porcentaje > 50 ? 'var(--n-yellow)' : 'var(--n-red)',
            }}
          />
        </div>
        <div className="flex gap-3 mt-2">
          <span className="flex items-center gap-1 text-xs" style={{ color: '#4ade80' }}>
            <RotateCcw size={10} /> Cambiar
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: '#fbbf24' }}>
            <Search size={10} /> Revisar
          </span>
        </div>
      </div>

      {/* Items */}
      <div>
        {items.map(item => (
          <ItemRow key={item.id} item={item} editable={editable} onMark={handleMark} />
        ))}
      </div>
    </div>
  )
}
