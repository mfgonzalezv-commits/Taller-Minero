'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { agregarRepuesto, eliminarRepuesto } from '@/actions/repuestos'
import { Package, Plus, X } from 'lucide-react'

type Repuesto = {
  id: string
  descripcion: string
  cantidad: number
  unidad: string
  precioUnit: number
  total: number
  estadoSolicitud: 'SOLICITADO' | 'AUTORIZADO' | 'EN_COMPRAS' | 'RECHAZADO' | 'ENTREGADO' | 'EXTERNO'
  itemBodegaId?: string | null
}

type ItemBodega = {
  id: string; codigo: string; descripcion: string
  unidad: string; stockActual: { toString(): string }; precioRef: { toString(): string }
}

const UNIDADES = ['un', 'lt', 'kg', 'mt', 'gl', 'caja', 'par', 'bid']
const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const ESTADO_BADGE: Record<string, { label: string; color: string }> = {
  ENTREGADO: { label: 'Entregado', color: 'bg-green-900/60 text-green-300' },
  EXTERNO:   { label: 'Compra externa', color: 'bg-purple-900/60 text-purple-300' },
}

export default function RepuestosOT({ otId, repuestos, editable, itemsBodega }: {
  otId: string
  repuestos: Repuesto[]
  editable: boolean
  itemsBodega: ItemBodega[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mostrarForm, setMostrarForm] = useState(false)

  // Compra externa
  const [descExt, setDescExt] = useState('')
  const [cantExt, setCantExt] = useState('1')
  const [unidadExt, setUnidadExt] = useState('un')
  const [precioExt, setPrecioExt] = useState('')
  const [error, setError] = useState('')

  // Solo mostrar lo que ya fue entregado
  const entregados = repuestos.filter(r => r.estadoSolicitud === 'ENTREGADO' || r.estadoSolicitud === 'EXTERNO')

  const totalEntregado = entregados.reduce((acc, r) => acc + r.total, 0)

  const resetForm = () => {
    setDescExt(''); setCantExt('1'); setUnidadExt('un'); setPrecioExt('')
    setError(''); setMostrarForm(false)
  }

  const handleExterno = (e: React.FormEvent) => {
    e.preventDefault()
    if (!descExt.trim()) { setError('Ingresa una descripción'); return }
    setError('')
    startTransition(async () => {
      try {
        await agregarRepuesto({
          otId,
          descripcion: descExt,
          cantidad: Number(cantExt),
          unidad: unidadExt,
          precioUnit: Number(precioExt) || 0,
        })
        resetForm(); router.refresh()
      } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error') }
    })
  }

  const handleEliminar = (id: string) => {
    startTransition(async () => { await eliminarRepuesto(id, otId); router.refresh() })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
        <div className="flex items-center gap-2">
          <Package size={14} style={{ color: 'var(--n-yellow)' }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
            Repuestos y materiales entregados
          </p>
          {totalEntregado > 0 && (
            <span className="text-xs font-bold" style={{ color: 'var(--n-text-mid)' }}>· {fmt(totalEntregado)}</span>
          )}
        </div>
        {editable && !mostrarForm && (
          <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
            <Plus size={13} /> Registrar compra externa
          </button>
        )}
      </div>

      {/* Formulario compra externa */}
      {mostrarForm && (
        <form onSubmit={handleExterno} className="px-5 py-4 space-y-3" style={{ borderBottom: '1px solid var(--n-border)', backgroundColor: 'var(--n-bg)' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>
            Registrar compra externa — repuesto adquirido fuera de bodega
          </p>
          <input
            type="text" value={descExt} onChange={e => setDescExt(e.target.value)}
            required placeholder="Descripción del repuesto o insumo"
            className="n-input"
          />
          <div className="flex gap-2">
            <input type="number" value={cantExt} onChange={e => setCantExt(e.target.value)} min="0.01" step="0.01" required className="n-input w-24" />
            <select value={unidadExt} onChange={e => setUnidadExt(e.target.value)} className="n-input w-24">
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
            <input type="number" value={precioExt} onChange={e => setPrecioExt(e.target.value)} min="0" placeholder="Precio unitario" className="n-input flex-1" />
          </div>
          {precioExt && cantExt && (
            <p className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
              Total: {fmt(Number(cantExt) * Number(precioExt))}
            </p>
          )}
          {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={resetForm} className="n-btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={isPending} className="n-btn-primary flex-1">
              {isPending ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      {entregados.length === 0 ? (
        <p className="px-5 py-5 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>
          Sin repuestos entregados aún
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
              {['Descripción', 'Tipo', 'Cantidad', 'P. Unit.', 'Total', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entregados.map(r => {
              const badge = ESTADO_BADGE[r.estadoSolicitud] ?? { label: r.estadoSolicitud, color: 'bg-gray-700 text-gray-300' }
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--n-border)' }}>
                  <td className="px-4 py-3 font-medium text-white">{r.descripcion}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${badge.color}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{r.cantidad} {r.unidad}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{r.precioUnit > 0 ? fmt(r.precioUnit) : '—'}</td>
                  <td className="px-4 py-3 font-bold text-white">{r.total > 0 ? fmt(r.total) : '—'}</td>
                  <td className="px-4 py-3">
                    {editable && r.estadoSolicitud === 'EXTERNO' && (
                      <button onClick={() => handleEliminar(r.id)} disabled={isPending} style={{ color: 'var(--n-text-lt)' }} className="hover:opacity-80">
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {totalEntregado > 0 && (
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--n-border)' }}>
                <td colSpan={4} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--n-text-lt)' }}>Total</td>
                <td className="px-4 py-3 font-black text-white">{fmt(totalEntregado)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  )
}
