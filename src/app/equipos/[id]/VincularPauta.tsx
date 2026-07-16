'use client'

import { useState, useTransition } from 'react'
import { vincularPautaEquipo } from '@/actions/pautas'
import { Link2 } from 'lucide-react'

type Pauta = { id: string; nombre: string; tipoMetrica: string; ciclosDisponibles: number[] }

export default function VincularPauta({
  equipoId,
  pautas,
  pautaActualId,
}: {
  equipoId: string
  pautas: Pauta[]
  pautaActualId: string | null
}) {
  const [selected, setSelected] = useState(pautaActualId ?? '')
  const [pending, startTransition] = useTransition()

  const guardar = () => {
    startTransition(async () => {
      await vincularPautaEquipo(equipoId, selected || null)
    })
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <Link2 size={13} style={{ color: 'var(--n-text-lt)' }} />
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="n-input flex-1 text-xs py-1"
        style={{ fontSize: 12 }}
      >
        <option value="">— Sin pauta vinculada —</option>
        {pautas.map(p => (
          <option key={p.id} value={p.id}>
            [{p.tipoMetrica}] {p.nombre}
          </option>
        ))}
      </select>
      <button
        onClick={guardar}
        disabled={pending || selected === (pautaActualId ?? '')}
        className="n-btn-primary px-3 py-1"
        style={{ fontSize: 11, whiteSpace: 'nowrap' }}
      >
        {pending ? '...' : 'Vincular'}
      </button>
    </div>
  )
}
