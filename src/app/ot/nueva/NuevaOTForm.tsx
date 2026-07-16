'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { crearOT } from '@/actions/ot'
import type { PrioridadOT, TipoMantenimiento, TipoEquipo, OrigenFalla } from '@prisma/client'
import {
  ClipboardCheck, Eye, MessageSquare, Wrench, CalendarDays,
  HelpCircle, ChevronRight, ChevronLeft, Check,
} from 'lucide-react'

type PautaResumen = { id: string; nombre: string; tipoMetrica: string; ciclosDisponibles: number[] }
type Equipo = { id: string; codigo: string; nombre: string; tipo: TipoEquipo; pauta: PautaResumen | null }

const ORIGEN_OPTS: { v: OrigenFalla; label: string; desc: string; icon: React.ReactNode }[] = [
  { v: 'CHECKLIST_INSPECCION',    label: 'Checklist de inspección', desc: 'Detectado durante la revisión pre-turno',         icon: <ClipboardCheck size={22} /> },
  { v: 'DETECCION_VISUAL',        label: 'Visual en operación',     desc: 'El operador lo vio mientras trabajaba',            icon: <Eye size={22} /> },
  { v: 'REPORTE_OPERADOR',        label: 'Reporte del operador',    desc: 'El operador detuvo el equipo y reportó la falla',  icon: <MessageSquare size={22} /> },
  { v: 'DETECCION_TALLER',        label: 'Detectado en taller',     desc: 'Lo encontró el mecánico durante revisión',        icon: <Wrench size={22} /> },
  { v: 'MANTENIMIENTO_PREVENTIVO',label: 'Mantención programada',   desc: 'Surgió durante una mantención preventiva',        icon: <CalendarDays size={22} /> },
  { v: 'OTRO',                    label: 'Otro',                    desc: 'No aplica ninguna de las anteriores',             icon: <HelpCircle size={22} /> },
]

const PRIORIDADES: { v: PrioridadOT; label: string; desc: string; color: string; bg: string }[] = [
  { v: 'BAJA',   label: 'Baja',    desc: 'Puede esperar, no afecta operación',  color: 'text-gray-300',   bg: 'border-gray-500' },
  { v: 'MEDIA',  label: 'Media',   desc: 'Debe resolverse esta semana',         color: 'text-blue-300',   bg: 'border-blue-500' },
  { v: 'ALTA',   label: 'Alta',    desc: 'Detiene o limita la producción',      color: 'text-orange-300', bg: 'border-orange-500' },
  { v: 'CRITICA',label: 'Crítica', desc: 'Equipo detenido, atención inmediata', color: 'text-red-400',    bg: 'border-red-500' },
]

const PASOS = [
  '¿Cuál equipo?',
  '¿Cómo se detectó?',
  '¿Qué está pasando?',
  'Urgencia y plazo',
]

export default function NuevaOTForm({
  equipos,
  equipoIdInicial,
  tipoInicial,
}: {
  equipos: Equipo[]
  equipoIdInicial?: string
  tipoInicial?: TipoMantenimiento
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  // Si llega equipoId por URL, saltar directo al paso 1
  const [paso, setPaso] = useState(equipoIdInicial ? 1 : 0)

  const [equipoId, setEquipoId] = useState(equipoIdInicial ?? '')
  const [busquedaEquipo, setBusquedaEquipo] = useState('')
  const [origenFalla, setOrigenFalla] = useState<OrigenFalla | ''>('')
  const [reportadaPor, setReportadaPor] = useState('')
  const [descripcionFalla, setDescripcionFalla] = useState('')
  const [tipoMantenimiento, setTipoMantenimiento] = useState<TipoMantenimiento>(tipoInicial ?? 'CORRECTIVO')
  const [prioridad, setPrioridad] = useState<PrioridadOT>('MEDIA')
  const [cicloPM, setCicloPM] = useState<number | null>(null)

  const equipoSeleccionado = equipos.find(e => e.id === equipoId)
  const pautaEquipo = equipoSeleccionado?.pauta ?? null

  const puedeAvanzar = [
    !!equipoId,
    !!origenFalla,
    descripcionFalla.trim().length >= 5 && (tipoMantenimiento !== 'PREVENTIVO' || !pautaEquipo || cicloPM !== null),
    true,
  ][paso]

  const handleSubmit = () => {
    setError('')
    startTransition(async () => {
      try {
        await crearOT({
          equipoId,
          descripcionFalla,
          prioridad,
          tipoMantenimiento,
          origenFalla: origenFalla as OrigenFalla,
          reportadaPorNombre: reportadaPor || undefined,
          pautaId: (tipoMantenimiento === 'PREVENTIVO' && pautaEquipo) ? pautaEquipo.id : undefined,
          cicloPM: (tipoMantenimiento === 'PREVENTIVO' && cicloPM) ? cicloPM : undefined,
        })
        router.push('/ot')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear OT')
      }
    })
  }

  const equipo = equipoSeleccionado

  return (
    <div>
      {/* Barra de progreso */}
      <div className="flex items-center gap-2 mb-8">
        {PASOS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shrink-0 transition-all"
                style={{
                  backgroundColor: i < paso ? 'var(--n-yellow)' : i === paso ? 'rgba(255,209,0,0.2)' : 'var(--n-surface)',
                  color: i < paso ? '#1A1A1A' : i === paso ? 'var(--n-yellow)' : 'var(--n-text-lt)',
                  border: i === paso ? '2px solid var(--n-yellow)' : '2px solid transparent',
                }}
              >
                {i < paso ? <Check size={13} /> : i + 1}
              </div>
              <span className="text-xs font-medium hidden sm:block truncate" style={{ color: i === paso ? 'white' : 'var(--n-text-lt)' }}>
                {label}
              </span>
            </div>
            {i < PASOS.length - 1 && (
              <div className="h-px flex-1" style={{ backgroundColor: i < paso ? 'var(--n-yellow)' : 'var(--n-border)' }} />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>

        {/* PASO 1: Equipo */}
        {paso === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-black text-white mb-1">¿Qué equipo tiene problemas?</h2>
              <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Selecciona el equipo que necesita atención</p>
            </div>

            <input
              type="text"
              value={busquedaEquipo}
              onChange={e => setBusquedaEquipo(e.target.value)}
              placeholder="Buscar por nombre o código..."
              className="n-input text-sm"
              autoFocus
            />

            {(() => {
              const ORDEN_TIPO: Record<string, number> = { CAMION: 1, MAQUINARIA: 2, LIVIANO: 3, OTRO: 4 }
              const filtrados = equipos
                .filter(eq =>
                  !busquedaEquipo ||
                  eq.nombre.toLowerCase().includes(busquedaEquipo.toLowerCase()) ||
                  eq.codigo.toLowerCase().includes(busquedaEquipo.toLowerCase())
                )
                .sort((a, b) => (ORDEN_TIPO[a.tipo] ?? 9) - (ORDEN_TIPO[b.tipo] ?? 9) || a.nombre.localeCompare(b.nombre))

              const grupos = ['CAMION', 'MAQUINARIA', 'LIVIANO', 'OTRO'] as const
              const TIPO_LABEL: Record<string, string> = { CAMION: 'Camiones', MAQUINARIA: 'Maquinaria', LIVIANO: 'Livianos', OTRO: 'Otros' }

              return (
                <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                  {filtrados.length === 0 && (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--n-text-lt)' }}>Sin resultados</p>
                  )}
                  {grupos.map(tipo => {
                    const del_grupo = filtrados.filter(eq => eq.tipo === tipo)
                    if (del_grupo.length === 0) return null
                    return (
                      <div key={tipo}>
                        {!busquedaEquipo && (
                          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--n-text-lt)' }}>{TIPO_LABEL[tipo]}</p>
                        )}
                        <div className="grid gap-2">
                          {del_grupo.map(eq => (
                            <button
                              key={eq.id}
                              type="button"
                              onClick={() => setEquipoId(eq.id)}
                              className="flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-all"
                              style={{
                                backgroundColor: equipoId === eq.id ? 'rgba(255,209,0,0.1)' : 'var(--n-bg)',
                                border: `2px solid ${equipoId === eq.id ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                              }}
                            >
                              <div
                                className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 text-xs font-black"
                                style={{ backgroundColor: equipoId === eq.id ? 'var(--n-yellow)' : 'var(--n-surface)', color: equipoId === eq.id ? '#1A1A1A' : 'var(--n-text-lt)' }}
                              >
                                {eq.codigo.slice(0, 3)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{eq.nombre}</p>
                                <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{eq.codigo} · {eq.tipo}</p>
                              </div>
                              {equipoId === eq.id && <Check size={16} className="ml-auto shrink-0" style={{ color: 'var(--n-yellow)' }} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* PASO 2: Origen falla */}
        {paso === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-white mb-1">¿Cómo fue detectada la falla?</h2>
              <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>
                Equipo: <span className="text-white font-semibold">{equipo?.codigo} — {equipo?.nombre}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ORIGEN_OPTS.map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setOrigenFalla(opt.v)}
                  className="flex flex-col items-start gap-2 rounded-xl p-4 text-left transition-all"
                  style={{
                    backgroundColor: origenFalla === opt.v ? 'rgba(255,209,0,0.1)' : 'var(--n-bg)',
                    border: `2px solid ${origenFalla === opt.v ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                  }}
                >
                  <span style={{ color: origenFalla === opt.v ? 'var(--n-yellow)' : 'var(--n-text-lt)' }}>{opt.icon}</span>
                  <div>
                    <p className="text-sm font-bold" style={{ color: origenFalla === opt.v ? 'white' : 'var(--n-text-mid)' }}>{opt.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>
                ¿Quién lo reportó? <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
              </label>
              <input
                type="text"
                value={reportadaPor}
                onChange={e => setReportadaPor(e.target.value)}
                placeholder="Nombre del operador o persona que reportó..."
                className="n-input"
              />
            </div>
          </div>
        )}

        {/* PASO 3: Descripción */}
        {paso === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-white mb-1">¿Qué está pasando con el equipo?</h2>
              <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Describe el problema con el mayor detalle posible</p>
            </div>
            <div>
              <textarea
                value={descripcionFalla}
                onChange={e => setDescripcionFalla(e.target.value)}
                rows={5}
                placeholder="Ej: El camión presenta ruido en el motor al acelerar, sale humo negro por el escape y hay pérdida de potencia..."
                className="n-input resize-none"
                autoFocus
              />
              <p className="text-xs mt-1" style={{ color: descripcionFalla.length < 5 ? 'var(--n-red)' : 'var(--n-text-lt)' }}>
                {descripcionFalla.length < 5 ? 'Escribe al menos 5 caracteres' : `${descripcionFalla.length} caracteres`}
              </p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--n-text-lt)' }}>Tipo de intervención</label>
              <div className="flex gap-2">
                {([['CORRECTIVO','Correctivo'],['PREVENTIVO','Preventivo'],['PREDICTIVO','Predictivo']] as [TipoMantenimiento,string][]).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setTipoMantenimiento(v); setCicloPM(null) }}
                    className="flex-1 rounded-lg border py-2.5 text-xs font-bold uppercase tracking-wider transition"
                    style={{
                      borderColor: tipoMantenimiento === v ? 'var(--n-yellow)' : 'var(--n-border)',
                      backgroundColor: tipoMantenimiento === v ? 'rgba(255,209,0,0.1)' : 'transparent',
                      color: tipoMantenimiento === v ? 'var(--n-yellow)' : 'var(--n-text-lt)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tipoMantenimiento === 'PREVENTIVO' && pautaEquipo && (
              <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--n-yellow)' }}>Pauta vinculada</p>
                  <p className="text-sm font-semibold text-white">{pautaEquipo.nombre}</p>
                  <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>Métrica: {pautaEquipo.tipoMetrica}</p>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--n-text-lt)' }}>
                    Ciclo de mantención <span style={{ color: 'var(--n-red)', fontWeight: 700 }}>*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {pautaEquipo.ciclosDisponibles.map(ciclo => (
                      <button
                        key={ciclo}
                        type="button"
                        onClick={() => setCicloPM(ciclo)}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold transition"
                        style={{
                          backgroundColor: cicloPM === ciclo ? 'var(--n-yellow)' : 'var(--n-surface)',
                          color: cicloPM === ciclo ? '#1A1A1A' : 'var(--n-text-mid)',
                          border: `1px solid ${cicloPM === ciclo ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                        }}
                      >
                        {ciclo.toLocaleString()} {pautaEquipo.tipoMetrica}
                      </button>
                    ))}
                  </div>
                  {cicloPM === null && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--n-red)' }}>Selecciona el ciclo para autocomplete el checklist</p>
                  )}
                </div>
              </div>
            )}

            {tipoMantenimiento === 'PREVENTIVO' && !pautaEquipo && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ color: 'var(--n-text-lt)', backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
                Este equipo no tiene pauta de mantención vinculada. Puedes vincularla desde la ficha del equipo.
              </p>
            )}
          </div>
        )}

        {/* PASO 4: Urgencia */}
        {paso === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-white mb-1">¿Qué tan urgente es?</h2>
              <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Define la prioridad de atención</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {PRIORIDADES.map(p => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setPrioridad(p.v)}
                  className="flex flex-col items-start gap-1.5 rounded-xl p-4 text-left transition-all"
                  style={{
                    backgroundColor: prioridad === p.v ? 'rgba(255,255,255,0.05)' : 'var(--n-bg)',
                    border: `2px solid ${prioridad === p.v ? 'currentColor' : 'var(--n-border)'}`,
                    color: p.color.replace('text-', ''),
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <p className={`text-base font-black ${p.color}`}>{p.label}</p>
                    {prioridad === p.v && <Check size={15} className={p.color} />}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{p.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs font-medium mt-4" style={{ color: 'var(--n-red)' }}>{error}</p>}

        {/* Navegación */}
        <div className="flex gap-3 mt-6">
          {paso > 0 ? (
            <button
              type="button"
              onClick={() => setPaso(p => p - 1)}
              className="n-btn-ghost flex items-center gap-1.5"
            >
              <ChevronLeft size={15} /> Volver
            </button>
          ) : (
            <button type="button" onClick={() => router.back()} className="n-btn-ghost">
              Cancelar
            </button>
          )}

          {paso < PASOS.length - 1 ? (
            <button
              type="button"
              onClick={() => setPaso(p => p + 1)}
              disabled={!puedeAvanzar}
              className="n-btn-primary flex-1 flex items-center justify-center gap-1.5"
            >
              Siguiente <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="n-btn-primary flex-1"
            >
              {isPending ? 'Creando OT...' : 'Crear OT'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
