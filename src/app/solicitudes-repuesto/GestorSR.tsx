'use client'

import { useState, useTransition } from 'react'
import { cambiarEstadoSR } from '@/actions/sr'
import type { EstadoSR } from '@prisma/client'
import { Package, AlertTriangle, Clock, Truck, ShoppingBag, CheckCircle, XCircle, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'

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
  ot: { numeroOt: number; id: string; equipo: { codigo: string; nombre: string } }
}

const ESTADO_SR: Record<EstadoSR, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  BORRADOR:           { label: 'Borrador',          color: 'text-gray-400',   bg: 'bg-gray-800',      icon: <Clock size={12} /> },
  ENVIADA:            { label: 'Enviada',            color: 'text-blue-400',   bg: 'bg-blue-900/40',   icon: <Package size={12} /> },
  EN_BODEGA_CENTRAL:  { label: 'En Bodega Central', color: 'text-purple-400', bg: 'bg-purple-900/40', icon: <Truck size={12} /> },
  EN_ADQUISICIONES:   { label: 'En Adquisiciones',  color: 'text-orange-400', bg: 'bg-orange-900/40', icon: <ShoppingBag size={12} /> },
  ESPERANDO_LLEGADA:  { label: 'Esperando llegada', color: 'text-yellow-400', bg: 'bg-yellow-900/40', icon: <Clock size={12} /> },
  RECIBIDA_FAENA:     { label: 'Recibida en faena', color: 'text-teal-400',   bg: 'bg-teal-900/40',   icon: <CheckCircle size={12} /> },
  ENTREGADA:          { label: 'Entregada',          color: 'text-green-400',  bg: 'bg-green-900/40',  icon: <Check size={12} /> },
  RECHAZADA:          { label: 'Rechazada',          color: 'text-red-400',    bg: 'bg-red-900/40',    icon: <XCircle size={12} /> },
}

const TRANSICIONES: Record<EstadoSR, EstadoSR[]> = {
  BORRADOR:           ['ENVIADA'],
  ENVIADA:            ['EN_BODEGA_CENTRAL', 'RECIBIDA_FAENA', 'RECHAZADA'],
  EN_BODEGA_CENTRAL:  ['EN_ADQUISICIONES', 'ESPERANDO_LLEGADA', 'RECHAZADA'],
  EN_ADQUISICIONES:   ['ESPERANDO_LLEGADA', 'RECHAZADA'],
  ESPERANDO_LLEGADA:  ['RECIBIDA_FAENA'],
  RECIBIDA_FAENA:     ['ENTREGADA'],
  ENTREGADA:          [],
  RECHAZADA:          [],
}

const GRUPOS_ESTADO: { label: string; estados: EstadoSR[] }[] = [
  { label: 'Nuevas', estados: ['ENVIADA'] },
  { label: 'En gestión', estados: ['EN_BODEGA_CENTRAL', 'EN_ADQUISICIONES', 'ESPERANDO_LLEGADA'] },
  { label: 'Por entregar', estados: ['RECIBIDA_FAENA'] },
  { label: 'Cerradas', estados: ['ENTREGADA', 'RECHAZADA'] },
]

function SRFila({ sr }: { sr: SR }) {
  const [expandida, setExpandida] = useState(false)
  const [gestionar, setGestionar] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [nuevoEstado, setNuevoEstado] = useState<EstadoSR | null>(null)
  const [observacion, setObservacion] = useState('')
  const [fechaEstimada, setFechaEstimada] = useState('')
  const [error, setError] = useState('')

  const cfg = ESTADO_SR[sr.estado]
  const transiciones = TRANSICIONES[sr.estado]
  const codigo = `SR-${String(sr.numeroSr).padStart(4, '0')}`

  const handleConfirmar = () => {
    if (!nuevoEstado) return
    startTransition(async () => {
      try {
        await cambiarEstadoSR(sr.id, nuevoEstado, { observacion: observacion || undefined, fechaEstimadaLlegada: fechaEstimada || undefined })
        setGestionar(false)
        setNuevoEstado(null)
        setObservacion('')
        setFechaEstimada('')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${sr.urgente ? 'rgba(239,68,68,0.4)' : 'var(--n-border)'}`, backgroundColor: 'var(--n-bg)' }}>
      {/* Fila principal */}
      <div className="flex items-center gap-3 px-4 py-3">
        {sr.urgente && <AlertTriangle size={14} className="text-red-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white">{codigo}</span>
            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <Link href={`/ot/${sr.ot.id}`} className="text-xs hover:text-white transition" style={{ color: 'var(--n-text-lt)' }}>
              OT #{sr.ot.numeroOt} — {sr.ot.equipo.codigo} {sr.ot.equipo.nombre}
            </Link>
            <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>por {sr.creadoPor.nombre}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {transiciones.length > 0 && !gestionar && (
            <button
              type="button"
              onClick={() => setGestionar(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(255,209,0,0.1)', color: 'var(--n-yellow)', border: '1px solid rgba(255,209,0,0.3)' }}
            >
              Gestionar
            </button>
          )}
          <button type="button" onClick={() => setExpandida(p => !p)} style={{ color: 'var(--n-text-lt)' }}>
            {expandida ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Ítems */}
      <div className="px-4 pb-2 space-y-1">
        {sr.items.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--n-text-lt)' }}>
            <Package size={10} />
            <span className="text-white truncate">{item.descripcion}</span>
            <span>·</span>
            <span className="shrink-0">{item.cantidad} {item.unidad}</span>
            {item.precioEstimado && <span className="shrink-0">· ${item.precioEstimado.toLocaleString('es-CL')}</span>}
            {item.itemBodega && <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: 'rgba(255,209,0,0.1)', color: 'var(--n-yellow)' }}>Bodega · Stock: {item.itemBodega.stockActual}</span>}
          </div>
        ))}
      </div>

      {/* Panel gestión */}
      {gestionar && (
        <div className="px-4 pb-4 pt-2 space-y-3" style={{ borderTop: '1px solid var(--n-border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Mover a:</p>
          <div className="grid grid-cols-2 gap-2">
            {transiciones.map(estado => {
              const c = ESTADO_SR[estado]
              return (
                <button key={estado} type="button" onClick={() => setNuevoEstado(estado)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition"
                  style={{ border: `2px solid ${nuevoEstado === estado ? 'var(--n-yellow)' : 'var(--n-border)'}`, backgroundColor: nuevoEstado === estado ? 'rgba(255,209,0,0.08)' : 'var(--n-surface)', color: nuevoEstado === estado ? 'white' : 'var(--n-text-mid)' }}
                >
                  <span className={c.color}>{c.icon}</span>{c.label}
                </button>
              )
            })}
          </div>
          {nuevoEstado === 'ESPERANDO_LLEGADA' && (
            <input type="date" value={fechaEstimada} onChange={e => setFechaEstimada(e.target.value)} className="n-input text-sm" />
          )}
          <textarea value={observacion} onChange={e => setObservacion(e.target.value)} rows={2} placeholder="Observación (opcional)..." className="n-input resize-none text-sm" />
          {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setGestionar(false); setNuevoEstado(null) }} className="n-btn-ghost text-xs"><X size={12} /> Cancelar</button>
            <button type="button" onClick={handleConfirmar} disabled={!nuevoEstado || isPending} className="n-btn-primary flex-1 text-xs">
              {isPending ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* Historial expandible */}
      {expandida && sr.historial.length > 0 && (
        <div className="px-4 pb-4 pt-2 space-y-1.5" style={{ borderTop: '1px solid var(--n-border)' }}>
          {sr.historial.map(h => {
            const c = ESTADO_SR[h.estadoNuevo]
            return (
              <div key={h.id} className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 mt-0.5 ${c.color}`}>{c.icon}</span>
                <div>
                  <span className="font-semibold text-white">{c.label}</span>
                  {h.observacion && <span style={{ color: 'var(--n-text-lt)' }}> — {h.observacion}</span>}
                  <span className="block" style={{ color: 'var(--n-text-lt)' }}>
                    {h.usuario?.nombre} · {new Date(h.fechaCambio).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function GestorSR({ srs }: { srs: SR[] }) {
  const [filtroEstado, setFiltroEstado] = useState<'PENDIENTES' | 'TODAS'>('PENDIENTES')

  const filtradas = filtroEstado === 'PENDIENTES'
    ? srs.filter(s => !['ENTREGADA', 'RECHAZADA'].includes(s.estado))
    : srs

  return (
    <div className="space-y-6">
      {/* Filtro */}
      <div className="flex gap-2">
        {(['PENDIENTES', 'TODAS'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFiltroEstado(f)}
            className="text-xs font-bold px-4 py-2 rounded-lg transition"
            style={{
              backgroundColor: filtroEstado === f ? 'var(--n-yellow)' : 'var(--n-surface)',
              color: filtroEstado === f ? '#1A1A1A' : 'var(--n-text-lt)',
              border: '1px solid var(--n-border)',
            }}
          >
            {f === 'PENDIENTES' ? 'Pendientes' : 'Todas'}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <div className="text-center py-16">
          <Package size={32} className="mx-auto mb-3" style={{ color: 'var(--n-text-lt)' }} />
          <p className="text-sm font-semibold text-white">Sin solicitudes pendientes</p>
          <p className="text-xs mt-1" style={{ color: 'var(--n-text-lt)' }}>Todas las solicitudes están gestionadas</p>
        </div>
      ) : (
        GRUPOS_ESTADO.map(grupo => {
          const del_grupo = filtradas.filter(s => grupo.estados.includes(s.estado))
          if (del_grupo.length === 0) return null
          return (
            <div key={grupo.label}>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--n-text-lt)' }}>{grupo.label} ({del_grupo.length})</p>
              <div className="space-y-3">
                {del_grupo.map(sr => <SRFila key={sr.id} sr={sr} />)}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
