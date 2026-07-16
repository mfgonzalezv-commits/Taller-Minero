'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { eliminarOT } from '@/actions/ot'
import { Trash2 } from 'lucide-react'

export default function BorrarOT({ otId }: { otId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmar, setConfirmar] = useState(false)

  const handleBorrar = () => {
    startTransition(async () => {
      await eliminarOT(otId)
      router.push('/ot')
    })
  }

  if (!confirmar) {
    return (
      <button
        onClick={() => setConfirmar(true)}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition hover:opacity-80"
        style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
      >
        <Trash2 size={12} /> Borrar OT
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold" style={{ color: '#f87171' }}>¿Seguro?</span>
      <button
        onClick={handleBorrar}
        disabled={isPending}
        className="text-xs font-bold px-3 py-1.5 rounded transition"
        style={{ backgroundColor: '#ef4444', color: 'white' }}
      >
        {isPending ? 'Borrando...' : 'Sí, borrar'}
      </button>
      <button
        onClick={() => setConfirmar(false)}
        className="text-xs font-bold"
        style={{ color: 'var(--n-text-lt)' }}
      >
        Cancelar
      </button>
    </div>
  )
}
