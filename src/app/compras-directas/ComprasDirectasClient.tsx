'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { marcarCompraDirecta, regularizarCompraDirecta, solicitarAprobacionCompra, aprobarCompraDirectaCentral } from '@/actions/sr'
import { LIMITE_COMPRA_DIRECTA_FAENA } from '@/lib/compra-directa'

type Fila = Awaited<ReturnType<typeof import('@/actions/sr').getComprasDirectas>>[number]
const clp = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const caja = { backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }
const campo = { backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)', color: 'var(--n-text)' }

export default function ComprasDirectasClient({ filas, puedeComprar, puedeRegularizar, puedeAprobar }: { filas: Fila[]; puedeComprar: boolean; puedeRegularizar: boolean; puedeAprobar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [f, setF] = useState({ monto: '', comprobante: '', motivo: '', cotizaciones: '' })
  const correr = (fn: () => Promise<unknown>) => start(async () => { setError(null); try { await fn(); setAbierta(null); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción') } })

  const porAprobar = filas.filter(s => s.esCompraDirecta && s.aprobacionSolicitada && !s.aprobadaCentral && !s.regularizada)
  const enCurso = filas.filter(s => s.esCompraDirecta && !s.regularizada)
  const candidatas = filas.filter(s => !s.esCompraDirecta)
  const cerradas = filas.filter(s => s.regularizada)
  const monto = Number(f.monto) || 0
  const cots = () => f.cotizaciones.split('\n').map(x => x.trim()).filter(Boolean)

  return (
    <div className="space-y-6 max-w-5xl">
      {error && <p className="text-sm font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}

      {puedeAprobar && (
        <section className="rounded-xl p-4" style={caja}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#fbbf24' }}>Pendientes de aprobación central ({porAprobar.length})</h2>
          {porAprobar.length === 0 ? <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Sin compras esperando aprobación.</p> : porAprobar.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-t" style={{ borderColor: 'var(--n-border)' }}>
              <div className="text-sm text-white"><b>SR-{String(s.numeroSr).padStart(4, '0')}</b> · {s.faena} · OT {s.ot} ({s.equipo}) · <b>{clp(s.montoSolicitado ?? 0)}</b><br /><span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{s.items} — {s.motivoCompraDirecta}</span></div>
              <button disabled={pend} className="n-btn-primary text-xs px-3 py-1.5" onClick={() => correr(() => aprobarCompraDirectaCentral(s.id))}>Aprobar compra</button>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl p-4" style={caja}>
        <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>Compras directas en curso ({enCurso.length})</h2>
        {enCurso.length === 0 && <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>No hay compras directas por regularizar.</p>}
        {enCurso.map(s => {
          const necesitaAprob = monto >= LIMITE_COMPRA_DIRECTA_FAENA
          return (
            <div key={s.id} className="py-3 border-t" style={{ borderColor: 'var(--n-border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm text-white"><b>SR-{String(s.numeroSr).padStart(4, '0')}</b> · {s.faena} · OT {s.ot} ({s.equipo}) · estimado {clp(s.montoEstimado)}<br /><span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{s.items} — {s.motivoCompraDirecta}</span>
                  <br /><span className="text-xs font-bold" style={{ color: s.aprobadaCentral ? '#4ade80' : s.aprobacionSolicitada ? '#fbbf24' : 'var(--n-text-lt)' }}>{s.aprobadaCentral ? `Aprobada por el nivel central (tope ${clp(s.montoFinal ?? 0)})` : s.aprobacionSolicitada ? `Aprobación central solicitada por ${clp(s.montoSolicitado ?? 0)}` : 'Sin aprobación central'}</span></div>
                {puedeRegularizar && <button className="n-btn-ghost text-xs px-3 py-1.5" onClick={() => { setAbierta(abierta === s.id ? null : s.id); setF({ monto: String(s.montoEstimado || ''), comprobante: '', motivo: '', cotizaciones: '' }) }}>{abierta === s.id ? 'Cerrar' : 'Regularizar'}</button>}
              </div>
              {abierta === s.id && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input className="rounded px-2 py-1.5 text-sm" style={campo} type="number" min="0" placeholder="Total final con IVA ($)" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
                  <input className="rounded px-2 py-1.5 text-sm" style={campo} placeholder="Comprobante (factura / boleta N°)" value={f.comprobante} onChange={e => setF({ ...f, comprobante: e.target.value })} />
                  <input className="rounded px-2 py-1.5 text-sm sm:col-span-2" style={campo} placeholder="Motivo de la regularización" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} />
                  <textarea className="rounded px-2 py-1.5 text-sm sm:col-span-2" style={campo} rows={3} placeholder="Cotizaciones de respaldo (una por línea, al menos una)" value={f.cotizaciones} onChange={e => setF({ ...f, cotizaciones: e.target.value })} />
                  {necesitaAprob && !s.aprobadaCentral && <p className="text-xs sm:col-span-2" style={{ color: '#fbbf24' }}>Desde {clp(LIMITE_COMPRA_DIRECTA_FAENA)} necesita la aprobación del Jefe de Taller Central antes de regularizar.</p>}
                  <div className="flex gap-2 sm:col-span-2">
                    {necesitaAprob && !s.aprobadaCentral && puedeComprar && <button disabled={pend || s.aprobacionSolicitada} className="n-btn-ghost text-xs px-3 py-1.5" onClick={() => correr(() => solicitarAprobacionCompra(s.id, monto))}>{s.aprobacionSolicitada ? 'Aprobación ya solicitada' : 'Solicitar aprobación central'}</button>}
                    <button disabled={pend || (necesitaAprob && !s.aprobadaCentral)} className="n-btn-primary text-xs px-3 py-1.5" onClick={() => correr(() => regularizarCompraDirecta(s.id, { monto, comprobante: f.comprobante, motivo: f.motivo, cotizaciones: cots() }))}>Regularizar compra</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      {puedeComprar && (
        <section className="rounded-xl p-4" style={caja}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>Solicitudes que se pueden comprar de forma directa ({candidatas.length})</h2>
          {candidatas.length === 0 && <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Sin solicitudes abiertas.</p>}
          {candidatas.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-t" style={{ borderColor: 'var(--n-border)' }}>
              <div className="text-sm text-white"><b>SR-{String(s.numeroSr).padStart(4, '0')}</b> · {s.faena} · OT {s.ot} ({s.equipo}) · {s.estado}<br /><span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{s.items}</span></div>
              <button disabled={pend} className="n-btn-ghost text-xs px-3 py-1.5" onClick={() => { const m = window.prompt('Motivo de la compra directa (emergencia):'); if (m) correr(() => marcarCompraDirecta(s.id, m)) }}>Marcar compra directa</button>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl p-4" style={caja}>
        <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>Regularizadas ({cerradas.length})</h2>
        {cerradas.map(s => <p key={s.id} className="text-sm py-1 text-white">SR-{String(s.numeroSr).padStart(4, '0')} · {s.faena} · comprobante {s.comprobante ?? '—'} · {clp(s.montoFinal ?? 0)}</p>)}
        {cerradas.length === 0 && <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Aún no hay compras regularizadas.</p>}
      </section>
    </div>
  )
}
