'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reabrirOT } from '@/actions/ot'
import { RotateCcw } from 'lucide-react'

// Reapertura de una OT cerrada: solo Jefe/Administrador, con motivo obligatorio (queda auditada).
export default function ReabrirOT({ otId }: { otId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const confirmar = () => {
    if (!motivo.trim()) { setError('Debes indicar el motivo de la reapertura'); return }
    setError(null)
    startTransition(async () => {
      try { await reabrirOT(otId, motivo); router.refresh(); setAbierto(false) }
      catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reabrir la OT') }
    })
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition hover:opacity-80"
        style={{ backgroundColor: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
        <RotateCcw size={12} /> Reabrir OT
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="flex items-center gap-2">
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la reapertura"
          className="text-xs rounded px-2 py-1.5 border" style={{ backgroundColor: 'var(--n-bg)', borderColor: 'var(--n-border)', color: 'var(--n-text)' }} />
        <button onClick={confirmar} disabled={isPending} className="text-xs font-bold px-3 py-1.5 rounded transition" style={{ backgroundColor: '#fbbf24', color: '#111' }}>
          {isPending ? 'Reabriendo...' : 'Confirmar reapertura'}
        </button>
        <button onClick={() => setAbierto(false)} className="text-xs px-2 py-1.5" style={{ color: 'var(--n-text-lt)' }}>Cancelar</button>
      </div>
      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}
