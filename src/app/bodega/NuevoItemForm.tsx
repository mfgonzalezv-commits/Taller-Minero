'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearItem } from '@/actions/bodega'

const UNIDADES = ['UN', 'LT', 'KG', 'MT', 'GL', 'CAJA', 'PAR', 'ROLLO', 'BID']
const CATEGORIAS = ['Filtros', 'Lubricantes', 'Hidráulica', 'Eléctrico', 'Neumáticos', 'Estructuras', 'Herramientas', 'Otro']

export default function NuevoItemForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [unidad, setUnidad] = useState('UN')
  const [stockActual, setStockActual] = useState('0')
  const [stockMinimo, setStockMinimo] = useState('0')
  const [precioRef, setPrecioRef] = useState('')
  const [categoria, setCategoria] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk(false)

    startTransition(async () => {
      try {
        await crearItem({
          codigo: codigo.toUpperCase(),
          descripcion,
          unidad,
          stockActual: Number(stockActual),
          stockMinimo: Number(stockMinimo),
          precioRef: Number(precioRef) || 0,
          categoria: categoria || undefined,
        })
        setCodigo('')
        setDescripcion('')
        setStockActual('0')
        setStockMinimo('0')
        setPrecioRef('')
        setOk(true)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear ítem')
      }
    })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Nuevo ítem</p>
      </div>
      <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Código *</label>
            <input
              type="text"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              required
              placeholder="FLT-001"
              className="n-input uppercase"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Unidad</label>
            <select value={unidad} onChange={e => setUnidad(e.target.value)} className="n-input">
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Descripción *</label>
          <input
            type="text"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            required
            placeholder="Filtro de aceite motor"
            className="n-input"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Categoría</label>
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className="n-input">
            <option value="">Sin categoría</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Stock inicial</label>
            <input type="number" value={stockActual} onChange={e => setStockActual(e.target.value)} min="0" className="n-input" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Stock mínimo</label>
            <input type="number" value={stockMinimo} onChange={e => setStockMinimo(e.target.value)} min="0" className="n-input" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Precio ref. (CLP)</label>
            <input type="number" value={precioRef} onChange={e => setPrecioRef(e.target.value)} min="0" placeholder="0" className="n-input" />
          </div>
        </div>

        {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}
        {ok && <p className="text-xs font-medium" style={{ color: 'var(--n-yellow)' }}>Ítem creado correctamente</p>}

        <button type="submit" disabled={isPending} className="n-btn-primary w-full">
          {isPending ? 'Guardando...' : 'Agregar a bodega'}
        </button>
      </form>
    </div>
  )
}
