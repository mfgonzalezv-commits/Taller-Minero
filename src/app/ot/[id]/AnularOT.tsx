'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { anularOT } from '@/actions/ot'
import { Ban } from 'lucide-react'

export default function AnularOT({ otId }: { otId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmar, setConfirmar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAnular = () => {
    if (!motivo.trim()) {
      setError('Debes indicar el motivo de la anulación')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await anularOT(otId, motivo)
        router.push('/ot')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo anular la OT')
      }
    })
  }

  if (!confirmar) {
    return (
      <button
        onClick={() => setConfirmar(true)}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition hover:opacity-80"
        style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
      >
        <Ban size={12} /> Anular OT
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de la anulación"
          className="text-xs rounded px-2 py-1.5 border"
          style={{ backgroundColor: 'var(--n-bg)', borderColor: 'var(--n-border)', color: 'var(--n-text)' }}
        />
        <button
          onClick={handleAnular}
          disabled={isPending}
          className="text-xs font-bold px-3 py-1.5 rounded transition"
          style={{ backgroundColor: '#ef4444', color: 'white' }}
        >
          {isPending ? 'Anulando...' : 'Confirmar anulación'}
        </button>
        <button
          onClick={() => { setConfirmar(false); setError(null) }}
          className="text-xs font-bold"
          style={{ color: 'var(--n-text-lt)' }}
        >
          Cancelar
        </button>
      </div>
      {error && <span className="text-xs font-bold" style={{ color: '#f87171' }}>{error}</span>}
    </div>
  )
}
