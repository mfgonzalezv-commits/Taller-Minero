'use client'

import { useEffect, useState, useTransition } from 'react'
import { confirmarLecturaHorometro, getLecturasPendientes, rechazarLecturaHorometro } from '@/actions/horometro'

type Pendiente = Awaited<ReturnType<typeof getLecturasPendientes>>[number]

// Lecturas con salto anómalo: no se usan hasta que un Jefe o Planificador las confirme o rechace.
export default function PendientesHorometro() {
  const [items, setItems] = useState<Pendiente[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const cargar = () => { getLecturasPendientes().then(setItems).catch(() => setItems([])) }
  useEffect(cargar, [])

  const accion = (fn: () => Promise<void>) => startTransition(async () => {
    setError('')
    try { await fn(); cargar() } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  })

  if (items.length === 0) return null
  return (
    <div className="mx-auto max-w-md mt-6 rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid rgba(251,191,36,0.3)' }}>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#fbbf24' }}>Lecturas por confirmar ({items.length})</p>
      {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}
      {items.map((l) => (
        <div key={l.id} className="text-sm text-white space-y-1" style={{ borderTop: '1px solid var(--n-border)', paddingTop: 8 }}>
          <p className="font-bold">{l.equipo.codigo} · {l.horometro != null ? `${l.horometro} h` : `${l.kilometraje} km`}</p>
          <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{l.advertencia} · {l.usuario?.nombre ?? 'sin usuario'}</p>
          <div className="flex gap-2">
            <button disabled={isPending} className="n-btn-primary flex-1" onClick={() => accion(() => confirmarLecturaHorometro(l.id))}>Confirmar</button>
            <button disabled={isPending} className="flex-1 text-xs font-bold rounded-md px-3 py-2" style={{ border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}
              onClick={() => { const m = window.prompt('Motivo del rechazo'); if (m) accion(() => rechazarLecturaHorometro(l.id, m)) }}>Rechazar</button>
          </div>
        </div>
      ))}
    </div>
  )
}
