'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ESTADO_OT_CONFIG, PRIORIDAD_CONFIG } from '@/lib/constants'
import { Search, X } from 'lucide-react'

type OT = {
  id: string
  numeroOt: number
  estado: string
  prioridad: string
  descripcionFalla: string
  fechaCreacion: Date
  equipo: { codigo: string; nombre: string }
  responsable: { nombre: string } | null
}

const ESTADOS = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_REPARACION', 'ESPERA_REPUESTO', 'EN_VALIDACION', 'CERRADA'] as const
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const

export default function OTListaClient({ ots }: { ots: OT[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(null)
  const [prioridadFiltro, setPrioridadFiltro] = useState<string | null>(null)

  const filtradas = useMemo(() => {
    return ots.filter((ot) => {
      if (estadoFiltro && ot.estado !== estadoFiltro) return false
      if (prioridadFiltro && ot.prioridad !== prioridadFiltro) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        return (
          ot.descripcionFalla.toLowerCase().includes(q) ||
          ot.equipo.codigo.toLowerCase().includes(q) ||
          ot.equipo.nombre.toLowerCase().includes(q) ||
          String(ot.numeroOt).includes(q)
        )
      }
      return true
    })
  }, [ots, estadoFiltro, prioridadFiltro, busqueda])

  const hayFiltros = estadoFiltro || prioridadFiltro || busqueda.trim()

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        {/* Búsqueda */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--n-text-lt)' }} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por equipo, descripción o N° OT..."
            className="n-input pl-9"
          />
        </div>

        {/* Filtro estado */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--n-text-lt)' }}>Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS.map((e) => {
              const cfg = ESTADO_OT_CONFIG[e]
              const activo = estadoFiltro === e
              return (
                <button
                  key={e}
                  onClick={() => setEstadoFiltro(activo ? null : e)}
                  className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${activo ? cfg.color : ''}`}
                  style={!activo ? { backgroundColor: 'var(--n-bg)', color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' } : {}}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Filtro prioridad */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--n-text-lt)' }}>Prioridad</p>
          <div className="flex gap-1.5">
            {PRIORIDADES.map((p) => {
              const cfg = PRIORIDAD_CONFIG[p]
              const activo = prioridadFiltro === p
              return (
                <button
                  key={p}
                  onClick={() => setPrioridadFiltro(activo ? null : p)}
                  className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${activo ? cfg.color : ''}`}
                  style={!activo ? { backgroundColor: 'var(--n-bg)', color: 'var(--n-text-lt)', border: '1px solid var(--n-border)' } : {}}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {hayFiltros && (
          <button
            onClick={() => { setEstadoFiltro(null); setPrioridadFiltro(null); setBusqueda('') }}
            className="flex items-center gap-1.5 text-xs font-bold transition-opacity hover:opacity-80"
            style={{ color: 'var(--n-text-lt)' }}
          >
            <X size={12} /> Limpiar filtros
          </button>
        )}
      </div>

      {/* Resultado */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        {filtradas.length === 0 ? (
          <p className="px-5 py-8 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>
            {hayFiltros ? 'Sin resultados para estos filtros' : 'No hay órdenes de trabajo'}
          </p>
        ) : (
          <>
            <p className="px-5 py-2.5 text-xs font-bold" style={{ color: 'var(--n-text-lt)', borderBottom: '1px solid var(--n-border)' }}>
              {filtradas.length} {filtradas.length === 1 ? 'resultado' : 'resultados'}
              {filtradas.length < ots.length ? ` de ${ots.length}` : ''}
            </p>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
                  {['N°', 'Equipo', 'Falla', 'Estado', 'Prioridad', 'Fecha'].map(col => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((ot) => {
                  const ec = ESTADO_OT_CONFIG[ot.estado as keyof typeof ESTADO_OT_CONFIG]
                  const pc = PRIORIDAD_CONFIG[ot.prioridad as keyof typeof PRIORIDAD_CONFIG]
                  return (
                    <tr key={ot.id} className="n-row-hover" style={{ borderBottom: '1px solid var(--n-border)' }}>
                      <td className="px-5 py-3.5 font-mono text-sm font-bold" style={{ color: 'var(--n-text-lt)' }}>
                        #{ot.numeroOt}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-bold text-white">{ot.equipo.codigo}</p>
                        <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{ot.equipo.nombre}</p>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs">
                        <Link href={`/ot/${ot.id}`} className="text-sm font-medium hover:underline line-clamp-1" style={{ color: 'var(--n-yellow)' }}>
                          {ot.descripcionFalla}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold ${ec.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${ec.dot}`} />
                          {ec.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded px-2.5 py-1 text-xs font-bold ${pc.color}`}>
                          {pc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--n-text-lt)' }}>
                        {new Date(ot.fechaCreacion).toLocaleDateString('es-CL')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
