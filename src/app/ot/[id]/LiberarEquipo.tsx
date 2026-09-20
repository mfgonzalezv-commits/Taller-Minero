'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { liberarEquipo } from '@/actions/equipos'
import { Unlock } from 'lucide-react'

// Liberación operacional del equipo: Jefe/Planificador de la misma faena. Con reparación exige la validación técnica previa;
// sin reparación pide el motivo. El servidor vuelve a validar todo.
export default function LiberarEquipo({ equipoId }: { equipoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, start] = useTransition()

  const confirmar = () => start(async () => {
    setError(null)
    try { await liberarEquipo(equipoId, motivo || undefined); setAbierto(false); router.refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo liberar el equipo') }
  })

  if (!abierto) return (
    <button onClick={() => setAbierto(true)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition hover:opacity-80" style={{ backgroundColor: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
      <Unlock size={12} /> Liberar equipo
    </button>
  )
  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="flex items-center gap-2">
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obligatorio si no hubo reparación)" className="text-xs rounded px-2 py-1.5 border" style={{ backgroundColor: 'var(--n-bg)', borderColor: 'var(--n-border)', color: 'var(--n-text)' }} />
        <button onClick={confirmar} disabled={pendiente} className="text-xs font-bold px-3 py-1.5 rounded" style={{ backgroundColor: '#4ade80', color: '#111' }}>{pendiente ? 'Liberando...' : 'Confirmar liberación'}</button>
        <button onClick={() => setAbierto(false)} className="text-xs px-2 py-1.5" style={{ color: 'var(--n-text-lt)' }}>Cancelar</button>
      </div>
      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}
