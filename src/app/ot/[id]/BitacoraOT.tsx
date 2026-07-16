'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { agregarBitacora } from '@/actions/ot'
import { ESTADO_OT_CONFIG } from '@/lib/constants'
import type { EstadoOT, TipoIntervencionOT } from '@prisma/client'
import {
  Plus, Clock, User, X, Check, ChevronLeft, ChevronRight,
  Stethoscope, Wrench, Package, Search, ClipboardList, ShoppingCart, StickyNote, Trash2,
} from 'lucide-react'

const UNIDADES_REP = ['un', 'lt', 'kg', 'mt', 'gl', 'caja', 'par', 'bid']

const ESTADO_REP_BADGE: Record<string, { label: string; color: string }> = {
  SOLICITADO: { label: 'Pendiente autorización', color: 'bg-orange-900/60 text-orange-300' },
  AUTORIZADO: { label: 'Autorizado',             color: 'bg-blue-900/60 text-blue-300' },
  EN_COMPRAS: { label: 'En Compras',             color: 'bg-purple-900/60 text-purple-300' },
  RECHAZADO:  { label: 'Rechazado',              color: 'bg-red-900/60 text-red-300' },
  ENTREGADO:  { label: 'Entregado',              color: 'bg-green-900/60 text-green-300' },
  EXTERNO:    { label: 'Compra externa',         color: 'bg-purple-900/60 text-purple-300' },
}
import SolicitudesRepuestoOT from './SolicitudesRepuestoOT'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Trabajador = { id: string; nombre: string; cargo: string | null }

type EntradaHistorial = {
  id: string; fechaCambio: string; estadoNuevo: string; estadoAnterior: string | null
  tiempoEnEstadoMin: number; observacion: string | null
  usuario: { nombre: string } | null; tipo: 'historial'
}

type RepuestoBitacora = {
  id: string; descripcion: string; cantidad: number; unidad: string; estadoSolicitud: string
}

type EntradaBitacora = {
  id: string; fechaHora: string; createdAt: string; descripcion: string
  horaInicio: string | null; horaTermino: string | null
  personal: string[]; tipoIntervencion: string | null
  notaRepuesto: string | null; estado: string | null
  setEspera: boolean | null; usuario: { nombre: string } | null; tipo: 'bitacora'
  repuestos: RepuestoBitacora[]
}

type Entrada = EntradaHistorial | EntradaBitacora

// ─── Config tipos de intervención ─────────────────────────────────────────────

const TIPOS_INTERVENCION: { v: TipoIntervencionOT; label: string; icon: React.ReactNode; color: string }[] = [
  { v: 'DIAGNOSTICO',        label: 'En diagnóstico',       icon: <Stethoscope size={20} />, color: '#60a5fa' },
  { v: 'DIAGNOSTICO_FINAL',  label: 'Diagnosticado',        icon: <Stethoscope size={20} />, color: '#22d3ee' },
  { v: 'REPARACION',         label: 'Reparación',           icon: <Wrench size={20} />,       color: '#fb923c' },
  { v: 'CAMBIO_COMPONENTE',  label: 'Cambio de componente', icon: <Package size={20} />,      color: '#a78bfa' },
  { v: 'INSPECCION',         label: 'Inspección',           icon: <Search size={20} />,       color: '#34d399' },
  { v: 'MANTENIMIENTO',      label: 'Mantención',           icon: <ClipboardList size={20} />, color: '#fbbf24' },
  { v: 'SOLICITUD_REPUESTO', label: 'Solicitud repuesto',   icon: <ShoppingCart size={20} />,         color: '#f87171' },
  { v: 'NOTA',               label: 'Nota / observación',   icon: <StickyNote size={20} />,   color: '#94a3b8' },
]

const PASOS = ['Fecha y hora', 'Personal', 'Tipo', 'Detalle']

function formatFecha(d: string, soloFecha = false) {
  const opts: Intl.DateTimeFormatOptions = soloFecha
    ? { day: '2-digit', month: '2-digit', year: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }
  return new Date(d).toLocaleString('es-CL', opts)
}

function getTipoLabel(tipo: string | null) {
  return TIPOS_INTERVENCION.find(t => t.v === tipo) ?? null
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type ItemBodegaModal = { id: string; codigo: string; descripcion: string; unidad: string; stockActual: number; precioRef: number }

function ModalNuevaEntrada({
  otId, estadoActual, trabajadores, itemsBodega, onClose,
}: { otId: string; estadoActual: string; trabajadores: Trabajador[]; itemsBodega: ItemBodegaModal[]; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [paso, setPaso] = useState(0)
  const [error, setError] = useState('')

  // Campos
  const hoy = new Date().toISOString().split('T')[0]
  const [fecha, setFecha] = useState(hoy)
  const [horaInicio, setHoraInicio] = useState('')
  const [horaTermino, setHoraTermino] = useState('')
  const [personalSel, setPersonalSel] = useState<string[]>([])
  const [personalExtra, setPersonalExtra] = useState('')
  const [tipoIntervencion, setTipoIntervencion] = useState<TipoIntervencionOT | ''>('')
  const [descripcion, setDescripcion] = useState('')

  // Carrito de repuestos
  const [carritoRep, setCarritoRep] = useState<{ id: string; descripcion: string; cantidad: number; unidad: string }[]>([])
  const [repDesc, setRepDesc] = useState('')
  const [repCant, setRepCant] = useState('1')
  const [repUnidad, setRepUnidad] = useState('un')
  const [mostrarCarrito, setMostrarCarrito] = useState(false)

  const agregarRepuesto = () => {
    if (!repDesc.trim()) return
    setCarritoRep(prev => [...prev, { id: crypto.randomUUID(), descripcion: repDesc.trim(), cantidad: Number(repCant) || 1, unidad: repUnidad }])
    setRepDesc(''); setRepCant('1'); setRepUnidad('un')
  }

  const ESTADO_POR_TIPO: Partial<Record<TipoIntervencionOT, EstadoOT>> = {
    DIAGNOSTICO:       'EN_DIAGNOSTICO',
    DIAGNOSTICO_FINAL: 'DIAGNOSTICADO',
    REPARACION:        'EN_REPARACION',
    CAMBIO_COMPONENTE: 'EN_REPARACION',
    MANTENIMIENTO:     'EN_REPARACION',
    SOLICITUD_REPUESTO:'ESPERA_REPUESTO',
  }

  const toggleTecnico = (nombre: string) =>
    setPersonalSel(prev => prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre])

  const agregarExtra = () => {
    const n = personalExtra.trim()
    if (n && !personalSel.includes(n)) setPersonalSel(prev => [...prev, n])
    setPersonalExtra('')
  }

  const puedeAvanzar = [
    !!fecha,
    personalSel.length > 0,
    !!tipoIntervencion,
    descripcion.trim().length >= 1,
  ][paso]

  const guardar = () => {
    setError('')
    startTransition(async () => {
      try {
        const estadoAuto = tipoIntervencion ? ESTADO_POR_TIPO[tipoIntervencion as TipoIntervencionOT] : undefined
        await agregarBitacora(otId, {
          fechaHora: fecha,
          horaInicio: horaInicio || undefined,
          horaTermino: horaTermino || undefined,
          personal: personalSel,
          tipoIntervencion: tipoIntervencion as TipoIntervencionOT || undefined,
          descripcion: descripcion.trim(),
          estado: estadoAuto,
          repuestos: carritoRep.length > 0 ? carritoRep : undefined,
        })
        router.refresh()
        onClose()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', maxHeight: 'calc(100vh - 32px)' }}>

        {/* Header modal */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              Paso {paso + 1} de {PASOS.length}
            </p>
            <h2 className="text-base font-black text-white">{PASOS[paso]}</h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--n-text-lt)' }}><X size={18} /></button>
        </div>

        {/* Barra progreso */}
        <div className="flex" style={{ height: 3 }}>
          {PASOS.map((_, i) => (
            <div key={i} className="flex-1 transition-all" style={{ backgroundColor: i <= paso ? 'var(--n-yellow)' : 'var(--n-border)' }} />
          ))}
        </div>

        {/* Contenido paso */}
        <div className="px-6 py-5 min-h-[280px] overflow-y-auto flex-1">

          {/* PASO 1: Fecha y hora */}
          {paso === 0 && (
            <div className="space-y-4">
              <p className="text-sm font-medium" style={{ color: 'var(--n-text-lt)' }}>¿Cuándo se realizó el trabajo?</p>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} max={hoy} className="n-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>
                    Hora inicio <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
                  </label>
                  <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="n-input" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>
                    Hora término <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
                  </label>
                  <input type="time" value={horaTermino} onChange={e => setHoraTermino(e.target.value)} className="n-input" />
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: Personal */}
          {paso === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium" style={{ color: 'var(--n-text-lt)' }}>¿Quién trabajó en esta intervención?</p>

              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {trabajadores.length === 0 && (
                  <p className="text-xs py-2" style={{ color: 'var(--n-text-lt)' }}>No hay mecánicos registrados</p>
                )}
                {trabajadores.map(t => {
                  const sel = personalSel.includes(t.nombre)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTecnico(t.nombre)}
                      className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all"
                      style={{
                        backgroundColor: sel ? 'rgba(255,209,0,0.1)' : 'var(--n-bg)',
                        border: `1.5px solid ${sel ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                      }}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full shrink-0 text-xs font-black"
                        style={{ backgroundColor: sel ? 'var(--n-yellow)' : 'var(--n-surface)', color: sel ? '#1A1A1A' : 'var(--n-text-lt)' }}>
                        {t.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: sel ? 'white' : 'var(--n-text-mid)' }}>{t.nombre}</p>
                        {t.cargo && <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{t.cargo}</p>}
                      </div>
                      {sel && <Check size={14} className="shrink-0" style={{ color: 'var(--n-yellow)' }} />}
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={personalExtra}
                  onChange={e => setPersonalExtra(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarExtra() } }}
                  placeholder="Agregar persona externa (nombre libre)..."
                  className="n-input flex-1 text-sm"
                />
                <button type="button" onClick={agregarExtra} className="n-btn-ghost px-3">
                  <Plus size={14} />
                </button>
              </div>

              {personalSel.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {personalSel.map(n => (
                    <span key={n} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                      style={{ backgroundColor: 'rgba(255,209,0,0.15)', color: 'var(--n-yellow)', border: '1px solid rgba(255,209,0,0.3)' }}>
                      <User size={10} /> {n}
                      <button onClick={() => setPersonalSel(prev => prev.filter(p => p !== n))} className="ml-0.5">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PASO 3: Tipo de intervención */}
          {paso === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-medium" style={{ color: 'var(--n-text-lt)' }}>¿Qué tipo de trabajo se realizó?</p>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_INTERVENCION.map(t => {
                  const sel = tipoIntervencion === t.v
                  return (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => setTipoIntervencion(t.v)}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all"
                      style={{
                        backgroundColor: sel ? `${t.color}18` : 'var(--n-bg)',
                        border: `2px solid ${sel ? t.color : 'var(--n-border)'}`,
                      }}
                    >
                      <span style={{ color: sel ? t.color : 'var(--n-text-lt)' }}>{t.icon}</span>
                      <span className="text-sm font-bold" style={{ color: sel ? 'white' : 'var(--n-text-mid)' }}>{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* PASO 4: Detalle */}
          {paso === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium" style={{ color: 'var(--n-text-lt)' }}>Describe el trabajo realizado</p>
              <textarea
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                rows={5}
                autoFocus
                placeholder="Ej: Se revisó el sistema hidráulico, se encontró fuga en manguera de alta presión lado derecho. Se realizó cambio de manguera..."
                className="n-input resize-none"
              />
              {descripcion.trim().length === 0 && (
                <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>Escribe al menos una palabra para continuar</p>
              )}

              {tipoIntervencion && ESTADO_POR_TIPO[tipoIntervencion as TipoIntervencionOT] && (
                <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'rgba(255,209,0,0.07)', border: '1px solid rgba(255,209,0,0.2)', color: 'var(--n-text-lt)' }}>
                  <span>Al guardar, la OT pasará a</span>
                  <span className="font-bold text-white">{ESTADO_OT_CONFIG[ESTADO_POR_TIPO[tipoIntervencion as TipoIntervencionOT]!].label}</span>
                </div>
              )}

              {/* ── Solicitud de repuestos opcional ── */}
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--n-border)' }}>
                <button
                  type="button"
                  onClick={() => setMostrarCarrito(p => !p)}
                  className="flex items-center justify-between w-full px-3 py-2.5 text-left"
                  style={{ backgroundColor: mostrarCarrito ? 'rgba(255,209,0,0.06)' : 'var(--n-bg)' }}
                >
                  <span className="flex items-center gap-2 text-xs font-bold" style={{ color: mostrarCarrito ? 'var(--n-yellow)' : 'var(--n-text-lt)' }}>
                    <ShoppingCart size={13} />
                    Solicitar repuestos con esta entrada
                    {carritoRep.length > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-black" style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}>{carritoRep.length}</span>
                    )}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{mostrarCarrito ? '▲' : '▼'}</span>
                </button>

                {mostrarCarrito && (
                  <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid var(--n-border)', backgroundColor: 'var(--n-bg)' }}>
                    <div className="flex gap-2 pt-2">
                      <input
                        type="text" value={repDesc} onChange={e => setRepDesc(e.target.value)}
                        placeholder="Descripción del repuesto o material"
                        className="n-input flex-1 text-xs"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarRepuesto() } }}
                      />
                      <input type="number" value={repCant} onChange={e => setRepCant(e.target.value)} min="0.01" step="0.01" className="n-input w-16 text-xs" />
                      <select value={repUnidad} onChange={e => setRepUnidad(e.target.value)} className="n-input w-20 text-xs">
                        {UNIDADES_REP.map(u => <option key={u}>{u}</option>)}
                      </select>
                      <button type="button" onClick={agregarRepuesto}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold shrink-0"
                        style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}>
                        <Plus size={12} /> Agregar
                      </button>
                    </div>

                    {carritoRep.length > 0 && carritoRep.map((r, idx) => (
                      <div key={r.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
                        style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
                        <span className="w-4 text-center font-mono shrink-0" style={{ color: 'var(--n-text-lt)' }}>{idx + 1}</span>
                        <span className="flex-1 font-medium text-white">{r.descripcion}</span>
                        <span className="font-bold shrink-0" style={{ color: 'var(--n-yellow)' }}>{r.cantidad} {r.unidad}</span>
                        <button type="button" onClick={() => setCarritoRep(p => p.filter(x => x.id !== r.id))}
                          style={{ color: 'var(--n-text-lt)' }} className="hover:opacity-70 shrink-0">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                    {carritoRep.length === 0 && (
                      <p className="text-xs py-1" style={{ color: 'var(--n-text-lt)' }}>Sin repuestos añadidos aún</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}


          {error && <p className="text-xs font-medium mt-3" style={{ color: 'var(--n-red)' }}>{error}</p>}
        </div>

        {/* Footer navegación */}
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--n-border)' }}>
          {paso > 0 ? (
            <button type="button" onClick={() => setPaso(p => p - 1)} className="n-btn-ghost flex items-center gap-1.5">
              <ChevronLeft size={14} /> Volver
            </button>
          ) : (
            <button type="button" onClick={onClose} className="n-btn-ghost">Cancelar</button>
          )}

          {paso < PASOS.length - 1 ? (
            <button
              type="button"
              onClick={() => setPaso(p => p + 1)}
              disabled={!puedeAvanzar}
              className="n-btn-primary flex-1 flex items-center justify-center gap-1.5"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={guardar}
              disabled={isPending}
              className="n-btn-primary flex-1"
            >
              {isPending ? 'Guardando...' : 'Registrar en bitácora'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type ItemBodega = { id: string; codigo: string; descripcion: string; unidad: string; stockActual: number; precioRef: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any

export default function BitacoraOT({
  otId, estadoActual, historial, bitacora, trabajadores, editable, solicitudes, itemsBodega,
}: {
  otId: string
  estadoActual: string
  historial: EntradaHistorial[]
  bitacora: EntradaBitacora[]
  trabajadores: Trabajador[]
  editable: boolean
  solicitudes: SR[]
  itemsBodega: ItemBodega[]
}) {
  const [mostrarModal, setMostrarModal] = useState(false)

  const entradas: Entrada[] = [...historial, ...bitacora].sort((a, b) => {
    const da = a.tipo === 'historial' ? a.fechaCambio : a.fechaHora
    const db = b.tipo === 'historial' ? b.fechaCambio : b.fechaHora
    return new Date(da).getTime() - new Date(db).getTime()
  })

  return (
    <>
      {mostrarModal && (
        <ModalNuevaEntrada
          otId={otId}
          estadoActual={estadoActual}
          trabajadores={trabajadores}
          itemsBodega={itemsBodega}
          onClose={() => setMostrarModal(false)}
        />
      )}

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
            Bitácora de intervenciones
          </p>
          {editable && (
            <button
              onClick={() => setMostrarModal(true)}
              className="flex items-center gap-1.5 text-xs font-bold rounded-md px-3 py-1.5"
              style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}
            >
              <Plus size={12} /> Nueva entrada
            </button>
          )}
        </div>

        {/* Timeline */}
        <div className="px-5 py-4 space-y-4 max-h-[640px] overflow-y-auto">
          {entradas.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: 'var(--n-text-lt)' }}>
              Sin registros aún — presiona "Nueva entrada" para comenzar
            </p>
          )}

          {entradas.map((entrada, i) => {
            const fecha = entrada.tipo === 'historial' ? entrada.fechaCambio : entrada.fechaHora
            const tipoCfg = entrada.tipo === 'bitacora' ? getTipoLabel(entrada.tipoIntervencion) : null
            const ESTADO_IMPLICITO: Partial<Record<string, string>> = {
              DIAGNOSTICO: 'EN_DIAGNOSTICO', DIAGNOSTICO_FINAL: 'DIAGNOSTICADO', REPARACION: 'EN_REPARACION',
              CAMBIO_COMPONENTE: 'EN_REPARACION', MANTENIMIENTO: 'EN_REPARACION',
              SOLICITUD_REPUESTO: 'ESPERA_REPUESTO',
            }
            const estadoEsRedundante = entrada.tipo === 'bitacora'
              && entrada.tipoIntervencion
              && ESTADO_IMPLICITO[entrada.tipoIntervencion] === entrada.estado
            const estadoCfg = entrada.tipo === 'historial'
              ? ESTADO_OT_CONFIG[entrada.estadoNuevo as EstadoOT]
              : (!estadoEsRedundante && entrada.estado) ? ESTADO_OT_CONFIG[entrada.estado as EstadoOT] : null

            return (
              <div key={entrada.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2.5 w-2.5 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: tipoCfg?.color ?? estadoCfg?.dot?.replace('bg-', '') ?? '#4b5563' }} />
                  {i < entradas.length - 1 && <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--n-border)' }} />}
                </div>

                <div className="pb-4 flex-1 min-w-0">
                  {/* Fecha + hora + badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--n-yellow)' }} suppressHydrationWarning>
                      <Clock size={10} />
                      {entrada.tipo === 'bitacora' ? (
                        <>
                          {formatFecha(entrada.fechaHora, true)}
                          {entrada.horaInicio && (
                            <span>{' '}{entrada.horaInicio}{entrada.horaTermino ? ` – ${entrada.horaTermino}` : ''}</span>
                          )}
                        </>
                      ) : (
                        <>
                          {formatFecha(fecha)}
                          {entrada.usuario && (
                            <span style={{ color: 'var(--n-text-lt)', fontWeight: 400 }}> · {entrada.usuario.nombre}</span>
                          )}
                        </>
                      )}
                    </span>

                    {tipoCfg && (
                      <span className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold"
                        style={{ backgroundColor: `${tipoCfg.color}18`, color: tipoCfg.color }}>
                        {tipoCfg.icon} {tipoCfg.label}
                      </span>
                    )}
                    {estadoCfg && (
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${estadoCfg.color}`}>{estadoCfg.label}</span>
                    )}
                    {entrada.tipo === 'bitacora' && entrada.setEspera === true && (
                      <span className="rounded px-2 py-0.5 text-xs font-bold bg-orange-900/60 text-orange-300">⏳ Espera repuesto</span>
                    )}
                  </div>

                  {/* Tiempo en estado anterior (historial) */}
                  {entrada.tipo === 'historial' && entrada.estadoAnterior && entrada.tiempoEnEstadoMin > 0 && (
                    <p className="text-xs mb-1" style={{ color: 'var(--n-text-lt)' }}>
                      Tiempo en estado anterior:{' '}
                      <span style={{ color: 'var(--n-text-mid)', fontWeight: 600 }}>
                        {entrada.tiempoEnEstadoMin >= 60
                          ? `${Math.floor(entrada.tiempoEnEstadoMin / 60)}h ${entrada.tiempoEnEstadoMin % 60}min`
                          : `${entrada.tiempoEnEstadoMin} min`}
                      </span>
                    </p>
                  )}

                  {/* Timestamp de registro (solo bitácora) */}
                  {entrada.tipo === 'bitacora' && (
                    <p className="text-xs mb-1" style={{ color: 'var(--n-text-lt)' }} suppressHydrationWarning>
                      Registrado {formatFecha(entrada.createdAt)} · {entrada.usuario?.nombre ?? 'Sistema'}
                    </p>
                  )}

                  {/* Personal involucrado */}
                  {entrada.tipo === 'bitacora' && entrada.personal.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {entrada.personal.map(n => (
                        <span key={n} className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)', color: 'var(--n-text-mid)' }}>
                          <User size={9} /> {n}
                        </span>
                      ))}
                    </div>
                  )}


                  {/* Descripción */}
                  <p className="text-sm" style={{ color: entrada.tipo === 'bitacora' ? 'white' : 'var(--n-text-mid)' }}>
                    {entrada.tipo === 'historial'
                      ? (entrada.observacion ?? `Estado → ${estadoCfg?.label}`)
                      : entrada.descripcion}
                  </p>

                  {/* Repuestos vinculados a esta entrada */}
                  {entrada.tipo === 'bitacora' && entrada.repuestos.length > 0 && (
                    <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(248,113,113,0.25)' }}>
                      <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ backgroundColor: 'rgba(248,113,113,0.08)', borderBottom: '1px solid rgba(248,113,113,0.15)' }}>
                        <ShoppingCart size={11} style={{ color: '#f87171' }} />
                        <span className="text-xs font-bold" style={{ color: '#f87171' }}>Repuestos solicitados</span>
                      </div>
                      {entrada.repuestos.map(r => {
                        const badge = ESTADO_REP_BADGE[r.estadoSolicitud] ?? { label: r.estadoSolicitud, color: 'bg-gray-700 text-gray-300' }
                        return (
                          <div key={r.id} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(248,113,113,0.1)', backgroundColor: 'rgba(248,113,113,0.04)' }}>
                            <span className="flex-1 text-xs font-medium text-white">{r.descripcion}</span>
                            <span className="text-xs shrink-0" style={{ color: 'var(--n-text-lt)' }}>{r.cantidad} {r.unidad}</span>
                            <span className={`rounded px-1.5 py-0.5 text-xs font-bold shrink-0 ${badge.color}`}>{badge.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Nota repuesto (legado) */}
                  {entrada.tipo === 'bitacora' && entrada.notaRepuesto && entrada.repuestos.length === 0 && (
                    <div className="mt-2 rounded-lg px-3 py-2 text-xs"
                      style={{ backgroundColor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
                      🔧 Repuesto solicitado: {entrada.notaRepuesto}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <SolicitudesRepuestoOT
        otId={otId}
        solicitudes={solicitudes}
        itemsBodega={itemsBodega}
        editable={editable}
      />
    </>
  )
}
