'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, ClipboardList, Search, X, ChevronRight, FileText } from 'lucide-react'
import type { EquipoPMStatus } from '@/actions/pautas'
import ProgramarPMModal from './ProgramarPMModal'

const ESTADO_CFG = {
  VENCIDA:   { label: 'VENCIDA',   color: 'var(--n-red)',    bg: 'rgba(229,9,20,0.15)',    icon: AlertTriangle },
  PROXIMA:   { label: 'PRÓXIMA',   color: 'var(--n-yellow)', bg: 'rgba(255,209,0,0.12)',   icon: Clock },
  OT_ACTIVA: { label: 'OT ACTIVA', color: '#a5b4fc',         bg: 'rgba(99,102,241,0.15)',  icon: ClipboardList },
  OK:        { label: 'AL DÍA',    color: '#4ade80',         bg: 'rgba(74,222,128,0.1)',   icon: CheckCircle2 },
}

function BarraProgreso({ valorActual, cicloProximo, ciclosDisponibles }: {
  valorActual: number
  cicloProximo: number
  ciclosDisponibles: number[]
}) {
  // Encontrar el ciclo anterior para definir el rango de la barra
  const cicloAnterior = ciclosDisponibles
    .filter(c => {
      const mult = Math.floor(valorActual / c)
      return mult > 0 ? mult * c <= valorActual : false
    })
    .reduce((max, c) => {
      const mult = Math.floor(valorActual / c)
      const val = mult * c
      return val > max ? val : max
    }, 0)

  const rango = cicloProximo - cicloAnterior
  const avance = valorActual - cicloAnterior
  const pct = rango > 0 ? Math.min(100, Math.round((avance / rango) * 100)) : 100

  const color = pct >= 100 ? 'var(--n-red)' : pct >= 85 ? 'var(--n-yellow)' : '#4ade80'

  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--n-text-lt)' }}>
        <span>{cicloAnterior.toLocaleString()}</span>
        <span>{cicloProximo.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--n-bg)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function PMControlClient({ equipos }: { equipos: EquipoPMStatus[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS')

  const vencidas  = equipos.filter(e => e.estado === 'VENCIDA').length
  const proximas  = equipos.filter(e => e.estado === 'PROXIMA').length
  const otActivas = equipos.filter(e => e.estado === 'OT_ACTIVA').length

  const filtrados = useMemo(() => {
    return equipos.filter(e => {
      if (filtroEstado !== 'TODOS' && e.estado !== filtroEstado) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        return e.codigo.toLowerCase().includes(q) ||
          e.nombre.toLowerCase().includes(q) ||
          e.pauta.nombre.toLowerCase().includes(q)
      }
      return true
    })
  }, [equipos, filtroEstado, busqueda])

  if (equipos.length === 0) {
    return (
      <div className="rounded-xl p-10 text-center" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--n-text-lt)' }}>
          Ningún equipo tiene pauta vinculada aún.
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--n-text-lt)' }}>
          Ve a la ficha de cada equipo para vincular su pauta de mantención.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--n-text-lt)' }} />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por equipo o pauta..."
            className="n-input pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'TODOS',     label: `Todos (${equipos.length})`,     color: 'var(--n-text-lt)' },
            { key: 'VENCIDA',   label: `Vencidas (${vencidas})`,        color: 'var(--n-red)' },
            { key: 'PROXIMA',   label: `Próximas (${proximas})`,        color: 'var(--n-yellow)' },
            { key: 'OT_ACTIVA', label: `Con OT activa (${otActivas})`, color: '#a5b4fc' },
            { key: 'OK',        label: 'Al día',                        color: '#4ade80' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltroEstado(f.key)}
              className="rounded px-2.5 py-1 text-xs font-bold transition"
              style={{
                backgroundColor: filtroEstado === f.key ? f.color : 'var(--n-bg)',
                color: filtroEstado === f.key
                  ? (f.color === 'var(--n-yellow)' ? '#1A1A1A' : 'white')
                  : 'var(--n-text-lt)',
                border: `1px solid ${filtroEstado === f.key ? f.color : 'var(--n-border)'}`,
              }}
            >
              {f.label}
            </button>
          ))}
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="flex items-center gap-1 text-xs" style={{ color: 'var(--n-text-lt)' }}>
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {filtrados.length === 0 && (
        <p className="py-6 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin equipos para este filtro</p>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {filtrados.map(e => {
          const cfg = ESTADO_CFG[e.estado]
          const Icon = cfg.icon

          return (
            <div
              key={e.equipoId}
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: 'var(--n-surface)',
                border: `1px solid var(--n-border)`,
                borderLeft: `3px solid ${cfg.color}`,
              }}
            >
              <div className="px-5 py-4">
                <div className="flex items-start gap-4">

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        <Icon size={11} /> {cfg.label}
                      </span>
                      <span className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>{e.codigo}</span>
                      <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{e.nombre}</span>
                    </div>

                    <p className="text-sm font-semibold text-white">{e.pauta.nombre}</p>

                    {/* Métricas */}
                    <div className="flex gap-5 mt-2 flex-wrap">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Actual</p>
                        <p className="text-sm font-bold text-white">{e.valorActual.toLocaleString()} {e.unidad.toLowerCase()}</p>
                      </div>

                      {e.estado === 'VENCIDA' && e.cicloVencido && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-red)' }}>Ciclo vencido</p>
                          <p className="text-sm font-bold" style={{ color: 'var(--n-red)' }}>{e.cicloVencido.toLocaleString()} {e.unidad.toLowerCase()}</p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>
                          {e.estado === 'VENCIDA' ? 'Próxima PM' : 'Próxima a'}
                        </p>
                        <p className="text-sm font-bold text-white">{e.cicloProximo.toLocaleString()} {e.unidad.toLowerCase()}</p>
                      </div>

                      {e.estado !== 'VENCIDA' && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Faltan</p>
                          <p className="text-sm font-bold" style={{
                            color: e.restante <= 50 ? 'var(--n-red)' : e.restante <= 100 ? 'var(--n-yellow)' : 'white'
                          }}>
                            {e.restante.toLocaleString()} {e.unidad.toLowerCase()}
                          </p>
                        </div>
                      )}

                      {e.estado === 'OT_ACTIVA' && e.otActivaCiclo && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#a5b4fc' }}>OT en ciclo</p>
                          <p className="text-sm font-bold" style={{ color: '#a5b4fc' }}>{e.otActivaCiclo.toLocaleString()} {e.unidad.toLowerCase()}</p>
                        </div>
                      )}
                    </div>

                    {/* Barra de progreso */}
                    <BarraProgreso
                      valorActual={e.valorActual}
                      cicloProximo={e.cicloProximo}
                      ciclosDisponibles={e.pauta.ciclosDisponibles}
                    />

                    {/* Ciclos disponibles */}
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {e.pauta.ciclosDisponibles.map(c => {
                        const esVencido = e.cicloVencido === c
                        const esProximo = c === e.cicloProximo
                        return (
                          <span
                            key={c}
                            className="text-xs px-1.5 py-0.5 rounded font-mono"
                            style={{
                              backgroundColor: esVencido ? 'rgba(229,9,20,0.2)' : esProximo ? 'rgba(255,209,0,0.1)' : 'var(--n-bg)',
                              color: esVencido ? 'var(--n-red)' : esProximo ? 'var(--n-yellow)' : 'var(--n-text-lt)',
                              border: `1px solid ${esVencido ? 'var(--n-red)' : esProximo ? 'rgba(255,209,0,0.3)' : 'var(--n-border)'}`,
                              fontWeight: (esVencido || esProximo) ? 700 : 400,
                            }}
                          >
                            {c.toLocaleString()}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {e.estado === 'OT_ACTIVA' && e.otActivaId ? (
                      <Link
                        href={`/ot/${e.otActivaId}`}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                        style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                      >
                        <ClipboardList size={12} /> Ver OT
                      </Link>
                    ) : (
                      <>
                        <ProgramarPMModal
                          equipoId={e.equipoId}
                          equipoCodigo={e.codigo}
                          pautaId={e.pauta.id}
                          pautaNombre={e.pauta.nombre}
                          ciclosDisponibles={e.pauta.ciclosDisponibles}
                          unidad={e.unidad}
                          cicloSugerido={e.cicloVencido ?? e.cicloProximo}
                        />
                        <Link
                          href={`/ot/nueva?equipoId=${e.equipoId}&tipo=PREVENTIVO`}
                          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                          style={{
                            backgroundColor: e.estado === 'VENCIDA' ? 'var(--n-yellow)' : 'rgba(255,209,0,0.1)',
                            color: e.estado === 'VENCIDA' ? '#1A1A1A' : 'var(--n-yellow)',
                            border: '1px solid rgba(255,209,0,0.3)',
                          }}
                        >
                          <ClipboardList size={12} /> Abrir OT ahora
                        </Link>
                      </>
                    )}
                    <Link
                      href={`/pautas/${e.pauta.id}?equipoId=${e.equipoId}`}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                      style={{ color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' }}
                    >
                      <FileText size={12} /> Ver pauta
                    </Link>
                    <Link
                      href={`/equipos/${e.equipoId}`}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
                      style={{ color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' }}
                    >
                      Ver equipo <ChevronRight size={11} />
                    </Link>
                  </div>

                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
