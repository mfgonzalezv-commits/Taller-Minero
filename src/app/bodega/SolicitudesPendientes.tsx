'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { entregarSolicitud, derivarACompras, recibirDeCompras } from '@/actions/repuestos'
import { CheckCircle, X, Package, ShoppingBag, ArrowDownCircle } from 'lucide-react'
import Link from 'next/link'

type Solicitud = {
  id: string
  otId: string
  descripcion: string
  cantidad: number
  unidad: string
  createdAt: string
  estadoSolicitud: 'AUTORIZADO' | 'EN_COMPRAS'
  ot: { id: string; numeroOt: number; equipo: { codigo: string; nombre: string } }
}

type Item = {
  id: string; codigo: string; descripcion: string
  unidad: string; stockActual: number; precioRef: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function FilaEntrega({ sol, items }: { sol: Solicitud; items: Item[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const [itemSel, setItemSel] = useState('')
  const [precio, setPrecio] = useState('')
  const [cantEntregada, setCantEntregada] = useState(String(sol.cantidad))
  const [destinoResto, setDestinoResto] = useState<'BODEGA_CENTRAL' | 'COMPRAS'>('BODEGA_CENTRAL')
  const [error, setError] = useState('')

  const itemActual = items.find(i => i.id === itemSel)

  const handleEntregar = () => {
    const cantNum = Number(cantEntregada)
    if (!cantNum || cantNum <= 0) { setError('Cantidad inválida'); return }
    if (cantNum > sol.cantidad) { setError(`Máximo: ${sol.cantidad} ${sol.unidad}`); return }
    setError('')
    startTransition(async () => {
      try {
        await entregarSolicitud(sol.id, sol.otId, {
          precioUnit: Number(precio) || (itemActual?.precioRef ?? 0),
          cantidadEntregada: cantNum,
          itemBodegaId: itemSel || undefined,
          destinoResto: cantNum < sol.cantidad ? destinoResto : undefined,
        })
        setAbierto(false); router.refresh()
      } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error') }
    })
  }

  const handleDerivar = () => {
    startTransition(async () => {
      try { await derivarACompras(sol.id, sol.otId); router.refresh() }
      catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error') }
    })
  }

  return (
    <>
      <tr style={{ borderBottom: abierto ? 'none' : '1px solid var(--n-border)' }}>
        <td className="px-4 py-3">
          <Link href={`/ot/${sol.ot.id}`} className="font-bold text-white hover:underline">OT #{sol.ot.numeroOt}</Link>
          <p className="text-xs" style={{ color: 'var(--n-yellow)' }}>{sol.ot.equipo.codigo} — {sol.ot.equipo.nombre}</p>
        </td>
        <td className="px-4 py-3 font-medium text-white">{sol.descripcion}</td>
        <td className="px-4 py-3" style={{ color: 'var(--n-text-mid)' }}>{sol.cantidad} {sol.unidad}</td>
        <td className="px-4 py-3 text-xs" style={{ color: 'var(--n-text-lt)' }}>
          {new Date(sol.createdAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => { setAbierto(!abierto); setCantEntregada(String(sol.cantidad)); setError('') }}
              className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition"
              style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}>
              <CheckCircle size={12} /> Entregar
            </button>
            <button onClick={handleDerivar} disabled={isPending}
              className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition"
              style={{ backgroundColor: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#d8b4fe' }}>
              <ShoppingBag size={12} /> Sin stock → Compras
            </button>
          </div>
        </td>
      </tr>

      {abierto && (
        <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
          <td colSpan={5} className="px-4 py-4" style={{ backgroundColor: 'var(--n-bg)' }}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>
                    Cantidad a entregar <span style={{ fontWeight: 400 }}>(de {sol.cantidad} {sol.unidad})</span>
                  </label>
                  <input type="number" value={cantEntregada} onChange={e => setCantEntregada(e.target.value)}
                    min="0.01" max={sol.cantidad} step="0.01" className="n-input w-32" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Ítem de bodega</label>
                  <select value={itemSel} onChange={e => {
                    setItemSel(e.target.value)
                    setPrecio(items.find(i => i.id === e.target.value)?.precioRef.toString() ?? '')
                  }} className="n-input">
                    <option value="">Sin descontar stock</option>
                    {items.map(i => (
                      <option key={i.id} value={i.id} disabled={i.stockActual < Number(cantEntregada || sol.cantidad)}>
                        {i.codigo} — {i.descripcion} (stock: {i.stockActual} {i.unidad})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Precio unitario</label>
                  <input type="number" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="0" min="0" className="n-input w-32" />
                </div>
              </div>

              {cantEntregada && Number(cantEntregada) < sol.cantidad && (
                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: 'rgba(255,209,0,0.06)', border: '1px solid rgba(255,209,0,0.2)' }}>
                  <p className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
                    Entrega parcial — quedan {(sol.cantidad - Number(cantEntregada)).toFixed(2).replace(/\.?0+$/, '')} {sol.unidad} sin entregar
                  </p>
                  <div className="flex gap-2">
                    {(['BODEGA_CENTRAL', 'COMPRAS'] as const).map(d => (
                      <button key={d} type="button" onClick={() => setDestinoResto(d)}
                        className="flex-1 py-1.5 text-xs font-bold rounded transition"
                        style={{
                          backgroundColor: destinoResto === d ? 'rgba(255,209,0,0.15)' : 'var(--n-surface)',
                          border: `1px solid ${destinoResto === d ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                          color: destinoResto === d ? 'var(--n-yellow)' : 'var(--n-text-mid)',
                        }}>
                        {d === 'BODEGA_CENTRAL' ? 'Bodega central' : 'Compras / Adquisiciones'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {itemActual && precio && cantEntregada && (
                <p className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
                  Total: {fmt(Number(cantEntregada) * Number(precio))}
                </p>
              )}

              {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
              <div className="flex gap-2">
                <button onClick={handleEntregar} disabled={isPending} className="n-btn-primary">
                  {isPending ? '...' : cantEntregada && Number(cantEntregada) < sol.cantidad ? 'Confirmar entrega parcial' : 'Confirmar entrega'}
                </button>
                <button onClick={() => { setAbierto(false); setError('') }} className="n-btn-ghost"><X size={14} /></button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function FilaEnCompras({ sol }: { sol: Solicitud }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleRecibir = () => {
    startTransition(async () => {
      try { await recibirDeCompras(sol.id, sol.otId); router.refresh() }
      catch { /* silencioso */ }
    })
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
      <td className="px-4 py-3">
        <Link href={`/ot/${sol.ot.id}`} className="font-bold text-white hover:underline">OT #{sol.ot.numeroOt}</Link>
        <p className="text-xs" style={{ color: 'var(--n-yellow)' }}>{sol.ot.equipo.codigo} — {sol.ot.equipo.nombre}</p>
      </td>
      <td className="px-4 py-3 font-medium text-white">{sol.descripcion}</td>
      <td className="px-4 py-3" style={{ color: 'var(--n-text-mid)' }}>{sol.cantidad} {sol.unidad}</td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--n-text-lt)' }}>
        {new Date(sol.createdAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </td>
      <td className="px-4 py-3">
        <button onClick={handleRecibir} disabled={isPending}
          className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>
          <ArrowDownCircle size={12} /> Stock recibido
        </button>
      </td>
    </tr>
  )
}

export default function SolicitudesAutorizadas({ solicitudes, items }: {
  solicitudes: Solicitud[]
  items: Item[]
}) {
  const autorizadas = solicitudes.filter(s => s.estadoSolicitud === 'AUTORIZADO')
  const enCompras = solicitudes.filter(s => s.estadoSolicitud === 'EN_COMPRAS')

  return (
    <div className="space-y-4">
      {/* Autorizadas — pendientes de entrega */}
      {autorizadas.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <Package size={14} style={{ color: 'var(--n-yellow)' }} />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              Solicitudes autorizadas — pendientes de entrega
            </p>
            <span className="text-xs font-bold bg-blue-900/60 text-blue-300 rounded px-2 py-0.5">{autorizadas.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
                {['OT / Equipo', 'Repuesto', 'Cantidad', 'Fecha', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {autorizadas.map(sol => <FilaEntrega key={sol.id} sol={sol} items={items} />)}
            </tbody>
          </table>
        </div>
      )}

      {/* En Compras — esperando llegada */}
      {enCompras.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid rgba(168,85,247,0.3)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <ShoppingBag size={14} style={{ color: '#c084fc' }} />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              En Compras / Adquisiciones — esperando llegada
            </p>
            <span className="text-xs font-bold bg-purple-900/60 text-purple-300 rounded px-2 py-0.5">{enCompras.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
                {['OT / Equipo', 'Repuesto', 'Cantidad', 'Fecha', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enCompras.map(sol => <FilaEnCompras key={sol.id} sol={sol} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
