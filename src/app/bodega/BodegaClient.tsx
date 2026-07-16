'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { registrarMovimiento, editarItem } from '@/actions/bodega'
import { Pencil } from 'lucide-react'

type Item = {
  id: string
  codigo: string
  descripcion: string
  unidad: string
  stockActual: { toString(): string }
  stockMinimo: { toString(): string }
  precioRef: { toString(): string }
  categoria: string | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

type PanelActivo = { id: string; modo: 'mover' | 'editar' } | null

export default function BodegaClient({ items }: { items: Item[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [panelActivo, setPanelActivo] = useState<PanelActivo>(null)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')

  // Estado movimiento
  const [tipo, setTipo] = useState<'ENTRADA' | 'SALIDA' | 'AJUSTE'>('ENTRADA')
  const [cantidad, setCantidad] = useState('')
  const [obs, setObs] = useState('')

  // Estado edición
  const [editCodigo, setEditCodigo] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editUnidad, setEditUnidad] = useState('')
  const [editMinimo, setEditMinimo] = useState('')
  const [editPrecio, setEditPrecio] = useState('')
  const [editCategoria, setEditCategoria] = useState('')

  const filtrados = items.filter(
    i =>
      i.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
      i.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
      (i.categoria ?? '').toLowerCase().includes(busqueda.toLowerCase())
  )

  function abrirPanel(item: Item, modo: 'mover' | 'editar') {
    setError('')
    if (panelActivo?.id === item.id && panelActivo.modo === modo) {
      setPanelActivo(null)
      return
    }
    if (modo === 'editar') {
      setEditCodigo(item.codigo)
      setEditDesc(item.descripcion)
      setEditUnidad(item.unidad)
      setEditMinimo(item.stockMinimo.toString())
      setEditPrecio(item.precioRef.toString())
      setEditCategoria(item.categoria ?? '')
    } else {
      setCantidad('')
      setObs('')
    }
    setPanelActivo({ id: item.id, modo })
  }

  function mover(itemId: string) {
    if (!cantidad) return
    setError('')
    startTransition(async () => {
      try {
        await registrarMovimiento({ itemId, tipo, cantidad: Number(cantidad), observacion: obs || undefined })
        setCantidad('')
        setObs('')
        setPanelActivo(null)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  function guardarEdicion(itemId: string) {
    if (!editDesc || !editCodigo) return
    setError('')
    startTransition(async () => {
      try {
        await editarItem(itemId, {
          codigo: editCodigo.trim(),
          descripcion: editDesc.trim(),
          unidad: editUnidad.trim(),
          stockMinimo: Number(editMinimo) || 0,
          precioRef: Number(editPrecio) || 0,
          categoria: editCategoria.trim() || undefined,
        })
        setPanelActivo(null)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}>
        No hay ítems en bodega. Agrega el primero desde el formulario.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por descripción, código o categoría..."
        className="n-input"
      />

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
              {['Ítem', 'Stock', 'Mínimo', 'P. Ref.', 'Acciones'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(item => {
              const stock = Number(item.stockActual.toString())
              const minimo = Number(item.stockMinimo.toString())
              const bajo = stock <= minimo
              const panel = panelActivo?.id === item.id ? panelActivo.modo : null

              return (
                <>
                  <tr key={item.id} style={{ borderBottom: panel ? undefined : '1px solid var(--n-border)' }}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{item.descripcion}</p>
                      <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                        {item.codigo}{item.categoria && ` · ${item.categoria}`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-base" style={{ color: bajo ? 'var(--n-red)' : 'white' }}>
                        {stock}
                      </span>
                      <span className="text-xs ml-1" style={{ color: 'var(--n-text-lt)' }}>{item.unidad}</span>
                      {bajo && <p className="text-xs mt-0.5" style={{ color: 'var(--n-red)' }}>Bajo mínimo</p>}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{minimo} {item.unidad}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>
                      {Number(item.precioRef.toString()) > 0 ? fmt(Number(item.precioRef.toString())) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirPanel(item, 'mover')}
                          className="rounded-md px-3 py-1 text-xs font-bold transition"
                          style={{
                            backgroundColor: panel === 'mover' ? 'transparent' : 'var(--n-yellow)',
                            color: panel === 'mover' ? 'var(--n-text-lt)' : '#1A1A1A',
                            border: panel === 'mover' ? '1px solid var(--n-border)' : 'none',
                          }}
                        >
                          {panel === 'mover' ? 'Cerrar' : 'Mover'}
                        </button>
                        <button
                          onClick={() => abrirPanel(item, 'editar')}
                          className="rounded-md px-2 py-1 text-xs font-bold transition flex items-center gap-1"
                          style={{
                            backgroundColor: panel === 'editar' ? 'rgba(255,255,255,0.08)' : 'var(--n-surface)',
                            color: panel === 'editar' ? 'white' : 'var(--n-text-lt)',
                            border: '1px solid var(--n-border)',
                          }}
                        >
                          <Pencil size={11} /> Editar
                        </button>
                      </div>
                    </td>
                  </tr>

                  {panel === 'mover' && (
                    <tr key={`${item.id}-mover`} style={{ borderBottom: '1px solid var(--n-border)' }}>
                      <td colSpan={5} className="px-4 py-4" style={{ backgroundColor: 'var(--n-bg)' }}>
                        <div className="flex flex-wrap gap-3 items-end">
                          <div className="flex gap-1.5">
                            {(['ENTRADA', 'SALIDA', 'AJUSTE'] as const).map(t => (
                              <button
                                key={t}
                                onClick={() => setTipo(t)}
                                className="px-3 py-1.5 rounded-md text-xs font-bold transition"
                                style={{
                                  backgroundColor: tipo === t ? 'var(--n-yellow)' : 'transparent',
                                  color: tipo === t ? '#1A1A1A' : 'var(--n-text-lt)',
                                  border: `1px solid ${tipo === t ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                                }}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)}
                            placeholder="Cantidad" min="0.01" step="0.01" className="n-input w-28" />
                          <input type="text" value={obs} onChange={e => setObs(e.target.value)}
                            placeholder="Observación (opcional)" className="n-input flex-1 min-w-[160px]" />
                          <button onClick={() => mover(item.id)} disabled={isPending || !cantidad} className="n-btn-primary">
                            {isPending ? '...' : 'Confirmar'}
                          </button>
                          {error && <p className="w-full text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}
                        </div>
                      </td>
                    </tr>
                  )}

                  {panel === 'editar' && (
                    <tr key={`${item.id}-editar`} style={{ borderBottom: '1px solid var(--n-border)' }}>
                      <td colSpan={5} className="px-4 py-4" style={{ backgroundColor: 'var(--n-bg)' }}>
                        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Descripción</label>
                            <input className="n-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Código</label>
                            <input className="n-input" value={editCodigo} onChange={e => setEditCodigo(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Unidad</label>
                            <input className="n-input" value={editUnidad} onChange={e => setEditUnidad(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Stock mínimo</label>
                            <input className="n-input" type="number" min="0" value={editMinimo} onChange={e => setEditMinimo(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Precio ref. ($)</label>
                            <input className="n-input" type="number" min="0" value={editPrecio} onChange={e => setEditPrecio(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Categoría</label>
                            <input className="n-input" value={editCategoria} onChange={e => setEditCategoria(e.target.value)} placeholder="Opcional" />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => guardarEdicion(item.id)} disabled={isPending || !editDesc || !editCodigo} className="n-btn-primary">
                            {isPending ? '...' : 'Guardar cambios'}
                          </button>
                          <button onClick={() => setPanelActivo(null)} className="text-xs px-3 py-1.5 rounded-md" style={{ color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' }}>
                            Cancelar
                          </button>
                          {error && <p className="text-xs font-medium self-center" style={{ color: 'var(--n-red)' }}>{error}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
