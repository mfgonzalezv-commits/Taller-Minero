'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ESTADO_EQUIPO_CONFIG } from '@/lib/constants'
import { AlertTriangle, Search, X, ChevronRight } from 'lucide-react'

type Equipo = {
  id: string; codigo: string; nombre: string; tipo: string; marca: string | null
  estado: string; horometroActual: { toString(): string }; ubicacionActual: string | null
  ots: { id: string; estado: string; prioridad: string }[]
}

/* ── Iconos SVG ── */
const IconCamionMinero = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 15V10l3-4h5v9" /><path d="M9 7h11v8H9" /><path d="M1 15h19" /><path d="M6 6V4" />
    <circle cx="5" cy="17.5" r="1.5" /><circle cx="14" cy="17.5" r="1.5" /><circle cx="18.5" cy="17.5" r="1.5" />
  </svg>
)
const IconCargadorFrontal = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="7" width="7" height="7" rx="1" /><path d="M9 11H5L3 7H7l2 4z" /><path d="M3 7L2 4h5l2 3" />
    <path d="M16 9h4v5h-4" /><path d="M1 15h21" /><circle cx="6" cy="17.5" r="1.5" /><circle cx="18" cy="17.5" r="1.5" />
  </svg>
)
const IconPerforadora = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="13" /><path d="M9 1h6" /><path d="M10 5h4" /><path d="M10 9h4" />
    <rect x="7" y="13" width="10" height="4" rx="1" /><path d="M5 17h14" /><path d="M11 21l1-4 1 4" />
  </svg>
)
const IconCamioneta = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 14v-3l3-3h6l2 2h7v4H1z" /><path d="M1 14v1h18" /><path d="M4 11V8" /><path d="M6 8h4l1 3" />
    <rect x="14" y="11" width="5" height="3" /><circle cx="5" cy="16.5" r="1.5" /><circle cx="17" cy="16.5" r="1.5" />
  </svg>
)
const IconGenerador = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="12" rx="2" /><path d="M16 4v3" /><path d="M14 4h4" />
    <path d="M7 13l2 2 2-4 2 2 2-2" /><circle cx="19" cy="13" r="1.5" /><line x1="2" y1="11" x2="22" y2="11" />
  </svg>
)

/* ── Grupos madre ── */
type GrupoKey = 'CAMION' | 'MAQUINARIA' | 'PERFORADORA' | 'LIVIANO' | 'OTRO'
const GRUPOS: GrupoKey[] = ['CAMION', 'MAQUINARIA', 'PERFORADORA', 'LIVIANO', 'OTRO']
const GRUPO_CFG: Record<GrupoKey, { plural: string; Icon: React.ElementType }> = {
  CAMION:      { plural: 'Camiones',              Icon: IconCamionMinero    },
  MAQUINARIA:  { plural: 'Maquinaria',            Icon: IconCargadorFrontal },
  PERFORADORA: { plural: 'Máquinas Perforadoras', Icon: IconPerforadora     },
  LIVIANO:     { plural: 'Livianos',              Icon: IconCamioneta       },
  OTRO:        { plural: 'Otros',                 Icon: IconGenerador       },
}

function asignarGrupo(e: Equipo): GrupoKey {
  if (e.tipo === 'CAMION')  return 'CAMION'
  if (e.tipo === 'LIVIANO') return 'LIVIANO'
  if (e.tipo === 'OTRO')    return 'OTRO'
  if (e.nombre === 'Máquina Perforadora') return 'PERFORADORA'
  return 'MAQUINARIA'
}

/* ── Estado ── */
const ESTADO_DOT: Record<string, { dot: string; label: string }> = {
  OPERATIVO:         { dot: '#3DBE7A', label: 'Op.'        },
  DETENIDO:          { dot: '#E85C4A', label: 'Detenidos'  },
  TALLER:            { dot: '#FFD100', label: 'Taller'     },
  FUERA_DE_SERVICIO: { dot: '#6B7280', label: 'F/S'        },
}
const ESTADO_TINT: Record<string, string> = {
  OPERATIVO:         'rgba(61,190,122,0.07)',
  DETENIDO:          'rgba(232,92,74,0.10)',
  TALLER:            'rgba(255,209,0,0.07)',
  FUERA_DE_SERVICIO: 'rgba(107,114,128,0.06)',
}

function StatusPills({ lista }: { lista: Equipo[] }) {
  return (
    <>
      {['OPERATIVO','DETENIDO','TALLER','FUERA_DE_SERVICIO'].map(est => {
        const cnt = lista.filter(e => e.estado === est).length
        if (!cnt) return null
        return (
          <span key={est} className="flex items-center gap-1 text-xs" style={{ color: 'var(--n-text-lt)' }}>
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: ESTADO_DOT[est].dot }} />
            {cnt} {ESTADO_DOT[est].label}
          </span>
        )
      })}
    </>
  )
}

function OTBadge({ lista }: { lista: Equipo[] }) {
  const total = lista.reduce((s, e) => s + e.ots.length, 0)
  const critica = lista.some(e => e.ots.some(o => o.prioridad === 'CRITICA'))
  if (!total) return null
  return (
    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: critica ? 'var(--n-red)' : '#FF9F43' }}>
      <AlertTriangle size={10} />
      {total} OT{total > 1 ? 's' : ''}{critica && ' · CRÍTICA'}
    </span>
  )
}

/* ── Fila de tarjetas ── */
function FilaEquipos({ lista }: { lista: Equipo[] }) {
  return (
    <div
      className="overflow-x-auto pb-3"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--n-border) transparent' }}
    >
      <div className="flex gap-2.5" style={{ width: 'max-content', paddingLeft: 2 }}>
        {lista.map(equipo => {
          const ec = ESTADO_EQUIPO_CONFIG[equipo.estado]
          const otsActivas = equipo.ots.length
          const tieneCrit = equipo.ots.some(o => o.prioridad === 'CRITICA')
          return (
            <Link
              key={equipo.id}
              href={`/equipos/${equipo.id}`}
              className="rounded-lg shrink-0 transition-transform hover:scale-105 hover:brightness-110"
              style={{
                width: 164, height: 105,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                backgroundColor: ESTADO_TINT[equipo.estado],
                border: `1px solid ${otsActivas > 0 ? tieneCrit ? 'rgba(232,92,74,0.5)' : 'rgba(255,159,67,0.4)' : 'var(--n-border)'}`,
              }}
            >
              <div className="flex items-start justify-between p-2.5 pb-1">
                <div>
                  <p className="text-sm font-black text-white leading-none">{equipo.codigo}</p>
                  {equipo.marca && <p style={{ fontSize: 10, color: 'var(--n-text-lt)', marginTop: 2 }}>{equipo.marca}</p>}
                </div>
                <span className={`rounded px-1.5 py-0.5 font-bold shrink-0 ${ec.color}`} style={{ fontSize: 9 }}>{ec.label}</span>
              </div>
              <div className="px-2.5 pb-2.5">
                {otsActivas > 0 && (
                  <div className="flex items-center gap-1">
                    <AlertTriangle size={9} color={tieneCrit ? 'var(--n-red)' : '#FF9F43'} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: tieneCrit ? 'var(--n-red)' : '#FF9F43' }}>
                      {otsActivas} OT{otsActivas > 1 ? 's' : ''}{tieneCrit && ' · CRÍTICA'}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/* ── Componente principal ── */
export default function EquiposClient({ equipos }: { equipos: Equipo[] }) {
  const [busqueda, setBusqueda] = useState('')
  const [gruposOpen, setGruposOpen]   = useState<Record<string, boolean>>({})
  const [subgruposOpen, setSubgruposOpen] = useState<Record<string, boolean>>({})

  const toggleGrupo    = (k: string) => setGruposOpen(p => ({ ...p, [k]: !p[k] }))
  const toggleSubgrupo = (k: string) => setSubgruposOpen(p => ({ ...p, [k]: !p[k] }))

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return equipos
    const q = busqueda.toLowerCase()
    return equipos.filter(e =>
      e.codigo.toLowerCase().includes(q) ||
      e.nombre.toLowerCase().includes(q) ||
      (e.marca ?? '').toLowerCase().includes(q)
    )
  }, [equipos, busqueda])

  // grupo → subcategoría (nombre) → equipos
  const estructura = useMemo(() => {
    const map: Record<string, Record<string, Equipo[]>> = {}
    GRUPOS.forEach(g => { map[g] = {} })
    filtrados.forEach(e => {
      const g = asignarGrupo(e)
      if (!map[g][e.nombre]) map[g][e.nombre] = []
      map[g][e.nombre].push(e)
    })
    return map
  }, [filtrados])

  const buscando = busqueda.trim().length > 0

  return (
    <div className="space-y-0.5">
      {/* Buscador */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--n-text-lt)' }} />
        <input
          type="text" value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por código, nombre o marca..."
          className="n-input pl-9"
        />
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--n-text-lt)' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {GRUPOS.map(grupo => {
        const subMap = estructura[grupo] ?? {}
        const subNombres = Object.keys(subMap).sort()
        const listaTotal = subNombres.flatMap(n => subMap[n])
        if (listaTotal.length === 0 && buscando) return null

        const { plural, Icon } = GRUPO_CFG[grupo]
        const grupoAbierto = buscando || !!gruposOpen[grupo]

        return (
          <div key={grupo} className="rounded-xl overflow-hidden mb-2" style={{ border: '1px solid var(--n-border)' }}>

            {/* ── Cabecera grupo madre ── */}
            <button
              onClick={() => toggleGrupo(grupo)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left"
              style={{ backgroundColor: 'var(--n-surface)' }}
            >
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(255,209,0,0.12)' }}>
                <Icon size={18} color="var(--n-yellow)" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-black text-white">{plural}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--n-bg)', color: 'var(--n-text-lt)' }}>
                    {listaTotal.length}
                  </span>
                  <OTBadge lista={listaTotal} />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusPills lista={listaTotal} />
                  <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                    {subNombres.length} tipo{subNombres.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--n-text-lt)" strokeWidth="2" strokeLinecap="round"
                style={{ transform: grupoAbierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* ── Subcategorías ── */}
            {grupoAbierto && (
              <div style={{ backgroundColor: 'var(--n-bg)' }}>
                {subNombres.map((nombre, idx) => {
                  const lista = subMap[nombre]
                  const subKey = `${grupo}::${nombre}`
                  const subAbierto = buscando || !!subgruposOpen[subKey]
                  const isLast = idx === subNombres.length - 1

                  return (
                    <div key={nombre} style={{ borderTop: '1px solid var(--n-border)' }}>

                      {/* Fila subcategoría */}
                      <button
                        onClick={() => toggleSubgrupo(subKey)}
                        className="w-full flex items-center gap-3 text-left transition-colors hover:brightness-110"
                        style={{ padding: '10px 20px 10px 52px' }}
                      >
                        <ChevronRight
                          size={13}
                          style={{
                            color: 'var(--n-text-lt)',
                            transform: subAbierto ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.18s',
                            flexShrink: 0,
                          }}
                        />
                        <span className="text-sm font-bold text-white flex-1 text-left">{nombre}</span>
                        <div className="flex items-center gap-2.5">
                          <StatusPills lista={lista} />
                          <OTBadge lista={lista} />
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--n-surface)', color: 'var(--n-text-lt)' }}>
                            {lista.length}
                          </span>
                        </div>
                      </button>

                      {/* Tarjetas de la subcategoría */}
                      {subAbierto && (
                        <div style={{ padding: '0 20px 16px 52px' }}>
                          <FilaEquipos lista={lista} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
