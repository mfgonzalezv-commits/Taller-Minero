'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarAlertaLeida } from '@/actions/alertas'

type Item = { id: string; titulo: string; mensaje: string; nivel: number; leida: boolean; fecha: string }

export default function ListaNotificaciones({ items }: { items: Item[] }) {
  const router = useRouter()
  const [pendiente, start] = useTransition()
  if (items.length === 0) return <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Sin notificaciones.</p>
  return (
    <ul className="space-y-2 max-w-3xl">
      {items.map(n => (
        <li key={n.id} className="rounded-lg p-3 flex items-start justify-between gap-3" style={{ backgroundColor: 'var(--n-surface)', border: `1px solid ${n.nivel > 0 && !n.leida ? 'rgba(251,191,36,0.4)' : 'var(--n-border)'}`, opacity: n.leida ? 0.6 : 1 }}>
          <div>
            <p className="text-sm font-bold text-white">{n.titulo}</p>
            <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{n.mensaje}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--n-text-lt)' }}>{new Date(n.fecha).toLocaleString('es-CL')}</p>
          </div>
          {!n.leida && <button disabled={pendiente} className="n-btn-ghost text-xs" onClick={() => start(async () => { await marcarAlertaLeida(n.id); router.refresh() })}>Marcar leída</button>}
        </li>
      ))}
    </ul>
  )
}
