'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEstadoAlerta, generarOTDesdeAlerta } from '@/actions/inspeccion'
import { AlertTriangle, ClipboardList, CheckCircle, X, ChevronRight } from 'lucide-react'
import Link from 'next/link'

type Alerta = {
  id: string
  descripcion: string
  criticidad: 'INFORMATIVO' | 'OBSERVACION' | 'ALERTA' | 'CRITICO'
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTA' | 'DESCARTADA'
  otId: string | null
  createdAt: string
  equipo: { id: string; codigo: string; nombre: string }
  inspeccion: { fecha: string; turno: string; operador: { nombre: string } }
}

const CRITICIDAD_CONFIG = {
  CRITICO:     { color: 'text-red-400 bg-red-900/40',    border: 'var(--n-red)',    label: 'CRÍTICO' },
  ALERTA:      { color: 'text-orange-400 bg-orange-900/40', border: '#f97316',      label: 'ALERTA' },
  OBSERVACION: { color: 'text-yellow-400 bg-yellow-900/30', border: 'var(--n-yellow)', label: 'OBSERVACIÓN' },
  INFORMATIVO: { color: 'text-blue-400 bg-blue-900/30',  border: '#60a5fa',         label: 'INFO' },
}

const TURNO_LABEL: Record<string, string> = { 'MAÑANA': '🌅 Mañana', TARDE: '☀️ Tarde', NOCHE: '🌙 Noche' }

export default function AlertasClient({ alertas }: { alertas: Alerta[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filtro, setFiltro] = useState<'TODAS' | 'CRITICO' | 'ALERTA' | 'OBSERVACION'>('TODAS')

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => { await fn(); router.refresh() })

  const filtradas = alertas.filter(a =>
    filtro === 'TODAS' || a.criticidad === filtro
  )

  const criticos  = alertas.filter(a => a.criticidad === 'CRITICO').length
  const alertasN  = alertas.filter(a => a.criticidad === 'ALERTA').length
  const observ    = alertas.filter(a => a.criticidad === 'OBSERVACION').length

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Críticos', count: criticos, color: 'var(--n-red)', filtroVal: 'CRITICO' as const },
          { label: 'Alertas',  count: alertasN, color: '#f97316',      filtroVal: 'ALERTA' as const },
          { label: 'Observ.',  count: observ,   color: 'var(--n-yellow)', filtroVal: 'OBSERVACION' as const },
        ].map(({ label, count, color, filtroVal }) => (
          <button
            key={label}
            onClick={() => setFiltro(f => f === filtroVal ? 'TODAS' : filtroVal)}
            className="rounded-xl p-4 text-left transition-opacity hover:opacity-80"
            style={{
              backgroundColor: 'var(--n-surface)',
              border: `1px solid ${filtro === filtroVal ? color : 'var(--n-border)'}`,
            }}
          >
            <p className="text-2xl font-black" style={{ color: count > 0 ? color : 'var(--n-text-lt)' }}>{count}</p>
            <p className="text-xs font-bold uppercase tracking-wider mt-0.5" style={{ color: 'var(--n-text-lt)' }}>{label}</p>
          </button>
        ))}
      </div>

      {filtradas.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <CheckCircle size={28} className="mx-auto mb-2" style={{ color: '#4ade80' }} />
          <p className="text-sm font-bold text-white">Sin alertas activas</p>
          <p className="text-xs mt-1" style={{ color: 'var(--n-text-lt)' }}>Todos los equipos sin observaciones</p>
        </div>
      )}

      {filtradas.map(a => {
        const cfg = CRITICIDAD_CONFIG[a.criticidad]
        return (
          <div key={a.id} className="rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', borderLeft: `3px solid ${cfg.border}` }}>
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.color}`}>
                      <AlertTriangle size={10} className="inline mr-1" />{cfg.label}
                    </span>
                    <span className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>{a.equipo.codigo}</span>
                    <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{a.equipo.nombre}</span>
                    {a.otId && (
                      <Link href={`/ot/${a.otId}`} className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                        <ClipboardList size={10} /> OT generada
                      </Link>
                    )}
                  </div>

                  <p className="text-sm font-medium text-white">{a.descripcion}</p>

                  <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--n-text-lt)' }}>
                    <span>{new Date(a.createdAt).toLocaleDateString('es-CL')}</span>
                    <span>{TURNO_LABEL[a.inspeccion.turno] ?? a.inspeccion.turno}</span>
                    <span>Operador: {a.inspeccion.operador.nombre}</span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  {!a.otId && (
                    <button
                      onClick={() => run(() => generarOTDesdeAlerta(a.id))}
                      disabled={isPending}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                      style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}
                    >
                      <ClipboardList size={12} /> Crear OT
                    </button>
                  )}
                  <Link
                    href={`/equipos/${a.equipo.id}`}
                    className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded transition"
                    style={{ color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' }}
                  >
                    Ver equipo <ChevronRight size={11} />
                  </Link>
                  {a.estado === 'PENDIENTE' && (
                    <button
                      onClick={() => run(() => actualizarEstadoAlerta(a.id, 'DESCARTADA'))}
                      disabled={isPending}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded transition"
                      style={{ color: 'var(--n-text-lt)' }}
                    >
                      <X size={11} /> Descartar
                    </button>
                  )}
                  {a.otId && a.estado === 'EN_PROCESO' && (
                    <button
                      onClick={() => run(() => actualizarEstadoAlerta(a.id, 'RESUELTA'))}
                      disabled={isPending}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded transition"
                      style={{ color: '#4ade80' }}
                    >
                      <CheckCircle size={11} /> Resuelta
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
