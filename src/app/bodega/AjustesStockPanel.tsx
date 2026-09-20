'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aprobarAjusteStock, rechazarAjusteStock } from '@/actions/bodega'

type Ajuste = Awaited<ReturnType<typeof import('@/actions/bodega').getAjustesStock>>[number]

// Ajustes manuales de stock: los solicita la faena (inventario) y los aprueba el Jefe de Taller Central.
export default function AjustesStockPanel({ ajustes, puedeAprobar }: { ajustes: Ajuste[]; puedeAprobar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const correr = (fn: () => Promise<unknown>) => start(async () => { setError(null); try { await fn(); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar') } })
  const pendientes = ajustes.filter(a => a.estado === 'PENDIENTE'), resueltos = ajustes.filter(a => a.estado !== 'PENDIENTE').slice(0, 5)
  if (ajustes.length === 0) return null
  return (
    <section className="rounded-xl p-4 mt-6" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#fbbf24' }}>Ajustes de stock ({pendientes.length} pendientes)</h2>
      {error && <p className="text-xs mb-2" style={{ color: 'var(--n-red)' }}>{error}</p>}
      {pendientes.map(a => (
        <div key={a.id} className="flex items-center justify-between gap-3 py-2 border-t" style={{ borderColor: 'var(--n-border)' }}>
          <p className="text-sm text-white">{a.faena} · {a.item}: {a.actual} → <b>{a.nueva}</b><br /><span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{a.motivo} — solicitó {a.solicitadoPor}</span></p>
          {puedeAprobar && !a.propia ? (
            <div className="flex gap-2">
              <button disabled={pend} className="n-btn-primary text-xs px-3 py-1.5" onClick={() => correr(() => aprobarAjusteStock(a.id))}>Aprobar</button>
              <button disabled={pend} className="n-btn-ghost text-xs px-3 py-1.5" onClick={() => { const m = window.prompt('Motivo del rechazo:'); if (m) correr(() => rechazarAjusteStock(a.id, m)) }}>Rechazar</button>
            </div>
          ) : <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{a.propia ? 'Esperando al Jefe Central' : 'Pendiente'}</span>}
        </div>
      ))}
      {resueltos.map(a => <p key={a.id} className="text-xs py-1" style={{ color: 'var(--n-text-lt)' }}>{a.estado === 'APROBADO' ? '✓' : '✗'} {a.item}: {a.actual} → {a.nueva} ({a.estado.toLowerCase()})</p>)}
    </section>
  )
}
