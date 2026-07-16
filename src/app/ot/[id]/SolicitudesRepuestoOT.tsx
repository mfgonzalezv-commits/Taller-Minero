'use client'

import { useState, useTransition } from 'react'
import { crearSR, cambiarEstadoSR } from '@/actions/sr'
import type { EstadoSR } from '@prisma/client'
import { Plus, X, ChevronLeft, ChevronRight, Check, Package, AlertTriangle, Clock, Truck, ShoppingBag, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ItemBodega = { id: string; codigo: string; descripcion: string; unidad: string; stockActual: number; precioRef: number }
type ItemSR = {
  id: string; descripcion: string; cantidad: number; unidad: string
  itemBodegaId: string | null; precioEstimado: number | null; cantidadEntregada: number
  itemBodega: { codigo: string; stockActual: number } | null
}
type HistorialEntry = { id: string; estadoAnterior: EstadoSR | null; estadoNuevo: EstadoSR; observacion: string | null; usuario: { nombre: string } | null; fechaCambio: string }
type SR = {
  id: string; numeroSr: number; estado: EstadoSR; urgente: boolean; observacion: string | null
  fechaEstimadaLlegada: string | null; creadoPor: { nombre: string }; gestionadoPor: { nombre: string } | null
  createdAt: string; items: ItemSR[]; historial: HistorialEntry[]
}

// ─── Config estados ───────────────────────────────────────────────────────────

const ESTADO_SR: Record<EstadoSR, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  BORRADOR:           { label: 'Borrador',          color: 'text-gray-400',   bg: 'bg-gray-800',   icon: <Clock size={12} /> },
  ENVIADA:            { label: 'Enviada',            color: 'text-blue-400',   bg: 'bg-blue-900/40', icon: <Package size={12} /> },
  EN_BODEGA_CENTRAL:  { label: 'En Bodega Central', color: 'text-purple-400', bg: 'bg-purple-900/40', icon: <Truck size={12} /> },
  EN_ADQUISICIONES:   { label: 'En Adquisiciones',  color: 'text-orange-400', bg: 'bg-orange-900/40', icon: <ShoppingBag size={12} /> },
  ESPERANDO_LLEGADA:  { label: 'Esperando llegada', color: 'text-yellow-400', bg: 'bg-yellow-900/40', icon: <Clock size={12} /> },
  RECIBIDA_FAENA:     { label: 'Recibida en faena', color: 'text-teal-400',   bg: 'bg-teal-900/40',  icon: <CheckCircle size={12} /> },
  ENTREGADA:          { label: 'Entregada',          color: 'text-green-400',  bg: 'bg-green-900/40', icon: <Check size={12} /> },
  RECHAZADA:          { label: 'Rechazada',          color: 'text-red-400',    bg: 'bg-red-900/40',   icon: <XCircle size={12} /> },
}

const TRANSICIONES: Record<EstadoSR, EstadoSR[]> = {
  BORRADOR:           ['ENVIADA'],
  ENVIADA:            ['ENTREGADA', 'EN_BODEGA_CENTRAL', 'RECHAZADA'],
  EN_BODEGA_CENTRAL:  ['ESPERANDO_LLEGADA', 'EN_ADQUISICIONES', 'RECHAZADA'],
  EN_ADQUISICIONES:   ['ESPERANDO_LLEGADA', 'RECHAZADA'],
  ESPERANDO_LLEGADA:  ['RECIBIDA_FAENA'],
  RECIBIDA_FAENA:     ['ENTREGADA'],
  ENTREGADA:          [],
  RECHAZADA:          [],
}

// ─── Modal nueva SR ───────────────────────────────────────────────────────────

type ItemForm = { descripcion: string; cantidad: string; unidad: string; itemBodegaId: string; precioEstimado: string }

function ModalNuevaSR({ otId, itemsBodega, onClose }: { otId: string; itemsBodega: ItemBodega[]; onClose: () => void }) {
  const [paso, setPaso] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [urgente, setUrgente] = useState(false)
  const [observacion, setObservacion] = useState('')
  const [items, setItems] = useState<ItemForm[]>([{ descripcion: '', cantidad: '1', unidad: 'UN', itemBodegaId: '', precioEstimado: '' }])
  const [busqueda, setBusqueda] = useState('')

  const PASOS = ['Ítems solicitados', 'Urgencia y observación']

  const addItem = () => setItems(p => [...p, { descripcion: '', cantidad: '1', unidad: 'UN', itemBodegaId: '', precioEstimado: '' }])
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof ItemForm, value: string) =>
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: value } : it))

  const seleccionarBodega = (i: number, item: ItemBodega) => {
    setItems(p => p.map((it, idx) => idx === i ? {
      ...it,
      itemBodegaId: item.id,
      descripcion: item.descripcion,
      unidad: item.unidad,
      precioEstimado: String(item.precioRef),
    } : it))
    setBusqueda('')
  }

  const itemsFiltrados = busqueda.length >= 2
    ? itemsBodega.filter(i => i.descripcion.toLowerCase().includes(busqueda.toLowerCase()) || i.codigo.toLowerCase().includes(busqueda.toLowerCase()))
    : []

  const itemsValidos = items.every(i => i.descripcion.trim().length >= 2 && Number(i.cantidad) > 0)

  const handleSubmit = () => {
    setError('')
    startTransition(async () => {
      try {
        await crearSR(otId, {
          urgente,
          observacion: observacion || undefined,
          items: items.map(i => ({
            descripcion: i.descripcion.trim(),
            cantidad: Number(i.cantidad),
            unidad: i.unidad || 'UN',
            itemBodegaId: i.itemBodegaId || undefined,
            precioEstimado: i.precioEstimado ? Number(i.precioEstimado) : undefined,
          })),
        })
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al crear solicitud')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--n-border)' }}>
          <div>
            <h2 className="text-base font-black text-white">Nueva Solicitud de Repuesto</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>Paso {paso + 1} de {PASOS.length} — {PASOS[paso]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition" style={{ color: 'var(--n-text-lt)' }}><X size={18} /></button>
        </div>

        {/* Progreso */}
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {PASOS.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full transition-all" style={{ backgroundColor: i <= paso ? 'var(--n-yellow)' : 'var(--n-border)' }} />
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* PASO 1: Items */}
          {paso === 0 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-white">¿Qué repuestos necesitas?</p>

              {/* Buscador bodega */}
              <div className="relative">
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar en bodega por nombre o código..."
                  className="n-input text-sm"
                />
                {itemsFiltrados.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
                    {itemsFiltrados.slice(0, 6).map(it => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          const idx = items.findIndex(i => !i.itemBodegaId)
                          if (idx >= 0) seleccionarBodega(idx, it)
                          else { addItem(); setTimeout(() => seleccionarBodega(items.length, it), 0) }
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition text-sm"
                      >
                        <span className="text-white truncate">{it.descripcion}</span>
                        <span className="text-xs ml-2 shrink-0" style={{ color: 'var(--n-text-lt)' }}>Stock: {it.stockActual} {it.unidad}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de items */}
              {items.map((item, i) => (
                <div key={i} className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Ítem {i + 1}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
                    )}
                  </div>
                  {item.itemBodegaId && (
                    <div className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(255,209,0,0.1)', color: 'var(--n-yellow)' }}>
                      <Package size={11} /> Desde bodega
                    </div>
                  )}
                  <input
                    type="text"
                    value={item.descripcion}
                    onChange={e => updateItem(i, 'descripcion', e.target.value)}
                    placeholder="Descripción del repuesto..."
                    className="n-input text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={e => updateItem(i, 'cantidad', e.target.value)} placeholder="Cant." className="n-input text-sm" />
                    <input type="text" value={item.unidad} onChange={e => updateItem(i, 'unidad', e.target.value)} placeholder="UN" className="n-input text-sm" />
                    <input type="number" min="0" value={item.precioEstimado} onChange={e => updateItem(i, 'precioEstimado', e.target.value)} placeholder="$ estimado" className="n-input text-sm" />
                  </div>
                </div>
              ))}

              <button type="button" onClick={addItem} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition" style={{ border: '1px dashed var(--n-border)', color: 'var(--n-text-lt)' }}>
                <Plus size={15} /> Agregar otro ítem
              </button>
            </div>
          )}

          {/* PASO 2: Urgencia */}
          {paso === 1 && (
            <div className="space-y-5">
              <p className="text-sm font-semibold text-white">¿Es urgente?</p>
              <div className="grid grid-cols-2 gap-3">
                {[false, true].map(val => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setUrgente(val)}
                    className="flex flex-col items-start gap-1.5 rounded-xl p-4 transition-all"
                    style={{
                      backgroundColor: urgente === val ? (val ? 'rgba(239,68,68,0.1)' : 'rgba(255,209,0,0.08)') : 'var(--n-bg)',
                      border: `2px solid ${urgente === val ? (val ? '#ef4444' : 'var(--n-yellow)') : 'var(--n-border)'}`,
                    }}
                  >
                    <span className="text-base font-black" style={{ color: urgente === val ? (val ? '#ef4444' : 'var(--n-yellow)') : 'var(--n-text-mid)' }}>
                      {val ? '🚨 Urgente' : '📋 Normal'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                      {val ? 'Equipo detenido, necesario de inmediato' : 'Puede seguir el proceso habitual'}
                    </span>
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>
                  Observación <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
                </label>
                <textarea
                  value={observacion}
                  onChange={e => setObservacion(e.target.value)}
                  rows={3}
                  placeholder="Contexto adicional para quien gestione la solicitud..."
                  className="n-input resize-none text-sm"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--n-border)' }}>
          {paso > 0
            ? <button type="button" onClick={() => setPaso(p => p - 1)} className="n-btn-ghost flex items-center gap-1.5"><ChevronLeft size={14} />Volver</button>
            : <button type="button" onClick={onClose} className="n-btn-ghost">Cancelar</button>
          }
          {paso < PASOS.length - 1
            ? <button type="button" onClick={() => setPaso(p => p + 1)} disabled={!itemsValidos} className="n-btn-primary flex-1 flex items-center justify-center gap-1.5">Siguiente <ChevronRight size={14} /></button>
            : <button type="button" onClick={handleSubmit} disabled={isPending} className="n-btn-primary flex-1">{isPending ? 'Enviando...' : 'Enviar solicitud'}</button>
          }
        </div>
      </div>
    </div>
  )
}

// ─── Modal cambiar estado SR ──────────────────────────────────────────────────

type OpcionGestion = {
  estado: EstadoSR
  titulo: string
  desc: string
  color: string
  icono: string
}

const OPCIONES_POR_ESTADO: Record<EstadoSR, OpcionGestion[]> = {
  BORRADOR: [],
  ENVIADA: [
    { estado: 'ENTREGADA',         titulo: 'Hay stock en bodega — entregar ahora', desc: 'El repuesto está disponible, se entrega al mecánico y se descuenta del stock',   color: '#4ade80', icono: '✅' },
    { estado: 'EN_BODEGA_CENTRAL', titulo: 'Sin stock — solicitar a Bodega Central', desc: 'Se envía solicitud formal a BC para que confirme disponibilidad y fecha de envío', color: '#c084fc', icono: '📦' },
    { estado: 'RECHAZADA',         titulo: 'Rechazar solicitud',                   desc: 'La solicitud no procede o fue duplicada',                                         color: '#f87171', icono: '❌' },
  ],
  EN_BODEGA_CENTRAL: [
    { estado: 'ESPERANDO_LLEGADA', titulo: 'BC confirma stock — en camino',        desc: 'BC tiene el repuesto y confirmó fecha de despacho a faena',                       color: '#facc15', icono: '🚚' },
    { estado: 'EN_ADQUISICIONES',  titulo: 'BC sin stock — deriva a Adquisiciones',desc: 'BC no tiene disponibilidad, el proceso pasa al depto. de compras',                color: '#fb923c', icono: '🛒' },
    { estado: 'RECHAZADA',         titulo: 'Rechazar',                             desc: '',                                                                               color: '#f87171', icono: '❌' },
  ],
  EN_ADQUISICIONES: [
    { estado: 'ESPERANDO_LLEGADA', titulo: 'OC generada — esperando llegada',      desc: 'Adquisiciones confirmó la compra y hay fecha estimada de llegada a faena',        color: '#facc15', icono: '📋' },
    { estado: 'RECHAZADA',         titulo: 'Rechazar',                             desc: '',                                                                               color: '#f87171', icono: '❌' },
  ],
  ESPERANDO_LLEGADA: [
    { estado: 'RECIBIDA_FAENA',    titulo: 'Llegó a bodega de faena',              desc: 'El repuesto llegó físicamente al taller, listo para entregar al mecánico',        color: '#2dd4bf', icono: '📬' },
  ],
  RECIBIDA_FAENA: [
    { estado: 'ENTREGADA',         titulo: 'Entregar al mecánico',                 desc: 'Se entrega físicamente al mecánico, se descuenta del inventario',                 color: '#4ade80', icono: '🔧' },
  ],
  ENTREGADA: [],
  RECHAZADA: [],
}

function ModalCambiarEstado({ sr, onClose }: { sr: SR; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [nuevoEstado, setNuevoEstado] = useState<EstadoSR | null>(null)
  const [observacion, setObservacion] = useState('')
  const [fechaEstimada, setFechaEstimada] = useState('')
  const [refBC, setRefBC] = useState('')
  const [error, setError] = useState('')

  const opciones = OPCIONES_POR_ESTADO[sr.estado] ?? []
  const codigo = `SR-${String(sr.numeroSr).padStart(4, '0')}`

  const handleSubmit = () => {
    if (!nuevoEstado) return
    setError('')
    startTransition(async () => {
      try {
        const obs = [refBC ? `Ref. BC: ${refBC}` : '', observacion].filter(Boolean).join(' · ')
        await cambiarEstadoSR(sr.id, nuevoEstado, {
          observacion: obs || undefined,
          fechaEstimadaLlegada: fechaEstimada || undefined,
        })
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
          <div>
            <h2 className="text-sm font-black text-white">{codigo}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>¿Qué pasó con este repuesto?</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--n-text-lt)' }}><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Ítems de la SR */}
          <div className="rounded-lg px-3 py-2 space-y-1" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
            {sr.items.map((item: ItemSR) => (
              <p key={item.id} className="text-xs text-white">{item.descripcion} · {item.cantidad} {item.unidad}</p>
            ))}
          </div>

          {/* Opciones */}
          <div className="space-y-2">
            {opciones.map(op => (
              <button
                key={op.estado}
                type="button"
                onClick={() => setNuevoEstado(op.estado)}
                className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-all"
                style={{
                  backgroundColor: nuevoEstado === op.estado ? `${op.color}15` : 'var(--n-bg)',
                  border: `2px solid ${nuevoEstado === op.estado ? op.color : 'var(--n-border)'}`,
                }}
              >
                <span className="text-lg shrink-0 leading-none mt-0.5">{op.icono}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: nuevoEstado === op.estado ? op.color : 'white' }}>{op.titulo}</p>
                  {op.desc && <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>{op.desc}</p>}
                </div>
                {nuevoEstado === op.estado && <Check size={14} className="shrink-0 mt-1" style={{ color: op.color }} />}
              </button>
            ))}
          </div>

          {/* Campos adicionales según estado elegido */}
          {nuevoEstado === 'EN_BODEGA_CENTRAL' && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>
                N° referencia o contacto en BC <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
              </label>
              <input type="text" value={refBC} onChange={e => setRefBC(e.target.value)} placeholder="Ej: Ref-2025-441 / Juan Pérez" className="n-input text-sm" />
            </div>
          )}

          {(nuevoEstado === 'ESPERANDO_LLEGADA') && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>Fecha estimada de llegada a faena</label>
              <input type="date" value={fechaEstimada} onChange={e => setFechaEstimada(e.target.value)} className="n-input" />
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>
              Observación <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
            </label>
            <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={2} className="n-input resize-none text-sm" placeholder="Ej: BC confirma stock, llega el jueves..." />
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
        </div>

        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--n-border)' }}>
          <button onClick={onClose} className="n-btn-ghost">Cancelar</button>
          <button onClick={handleSubmit} disabled={!nuevoEstado || isPending} className="n-btn-primary flex-1">
            {isPending ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Card de una SR ───────────────────────────────────────────────────────────

function SRCard({ sr, editable }: { sr: SR; editable: boolean }) {
  const [expandida, setExpandida] = useState(false)
  const [modalEstado, setModalEstado] = useState(false)
  const cfg = ESTADO_SR[sr.estado]
  const puedeGestionar = editable && TRANSICIONES[sr.estado].length > 0
  const codigo = `SR-${String(sr.numeroSr).padStart(4, '0')}`

  return (
    <>
      {modalEstado && <ModalCambiarEstado sr={sr} onClose={() => setModalEstado(false)} />}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--n-border)', backgroundColor: 'var(--n-bg)' }}>
        {/* Cabecera */}
        <div className="flex items-center gap-3 px-4 py-3">
          {sr.urgente && <AlertTriangle size={14} className="text-red-400 shrink-0" />}
          <span className="text-sm font-black text-white">{codigo}</span>
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="text-xs ml-auto" style={{ color: 'var(--n-text-lt)' }}>{sr.creadoPor.nombre}</span>
          <button type="button" onClick={() => setExpandida(p => !p)} style={{ color: 'var(--n-text-lt)' }}>
            {expandida ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {/* Ítems resumidos */}
        <div className="px-4 pb-3 space-y-1">
          {sr.items.map(item => (
            <div key={item.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--n-text-lt)' }}>
              <Package size={10} />
              <span className="text-white">{item.descripcion}</span>
              <span>·</span>
              <span>{item.cantidad} {item.unidad}</span>
              {item.itemBodega && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,209,0,0.1)', color: 'var(--n-yellow)' }}>Bodega · Stock: {item.itemBodega.stockActual}</span>}
            </div>
          ))}
        </div>

        {/* Detalle expandible */}
        {expandida && (
          <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--n-border)' }}>
            {sr.observacion && (
              <p className="text-xs pt-3" style={{ color: 'var(--n-text-lt)' }}>{sr.observacion}</p>
            )}
            {sr.fechaEstimadaLlegada && (
              <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                <span className="font-semibold text-white">Llegada estimada:</span> {new Date(sr.fechaEstimadaLlegada).toLocaleDateString('es-CL')}
              </p>
            )}
            {/* Historial */}
            <div className="space-y-1.5 pt-1">
              {sr.historial.map(h => {
                const cfgH = ESTADO_SR[h.estadoNuevo]
                return (
                  <div key={h.id} className="flex items-start gap-2 text-xs">
                    <span className={`shrink-0 mt-0.5 ${cfgH.color}`}>{cfgH.icon}</span>
                    <div>
                      <span className="font-semibold text-white">{cfgH.label}</span>
                      {h.observacion && <span style={{ color: 'var(--n-text-lt)' }}> — {h.observacion}</span>}
                      <span className="block" style={{ color: 'var(--n-text-lt)' }}>
                        {h.usuario?.nombre} · {new Date(h.fechaCambio).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Acción */}
        {puedeGestionar && (
          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => setModalEstado(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              style={{ backgroundColor: 'rgba(255,209,0,0.1)', color: 'var(--n-yellow)', border: '1px solid rgba(255,209,0,0.3)' }}
            >
              Actualizar estado →
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SolicitudesRepuestoOT({ otId, solicitudes, itemsBodega, editable }: {
  otId: string
  solicitudes: SR[]
  itemsBodega: ItemBodega[]
  editable: boolean
}) {
  const [modal, setModal] = useState(false)

  const pendientes = solicitudes.filter(s => !['ENTREGADA', 'RECHAZADA'].includes(s.estado))
  const cerradas = solicitudes.filter(s => ['ENTREGADA', 'RECHAZADA'].includes(s.estado))

  return (
    <>
      {modal && <ModalNuevaSR otId={otId} itemsBodega={itemsBodega} onClose={() => setModal(false)} />}

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--n-border)', backgroundColor: 'var(--n-surface)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: solicitudes.length > 0 ? '1px solid var(--n-border)' : 'none' }}>
          <div className="flex items-center gap-2">
            <Package size={16} style={{ color: 'var(--n-yellow)' }} />
            <span className="text-sm font-black text-white">Solicitudes de Repuesto</span>
            {pendientes.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400">{pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>Se generan desde la bitácora</span>
        </div>

        {solicitudes.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Package size={24} className="mx-auto mb-2" style={{ color: 'var(--n-text-lt)' }} />
            <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Sin solicitudes de repuesto</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {pendientes.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>En curso</p>
                {pendientes.map(sr => <SRCard key={sr.id} sr={sr} editable={editable} />)}
              </>
            )}
            {cerradas.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wider mt-3" style={{ color: 'var(--n-text-lt)' }}>Historial</p>
                {cerradas.map(sr => <SRCard key={sr.id} sr={sr} editable={false} />)}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
