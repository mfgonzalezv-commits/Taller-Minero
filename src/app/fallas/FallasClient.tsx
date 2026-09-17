'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  getReportesFalla,
  crearReporteFalla,
  validarDetencion,
  cambiarPrioridadReporte,
  cerrarReporteSinOT,
  convertirReporteEnOT,
} from '@/actions/fallas'
import { getEquiposParaHorometro } from '@/actions/horometro'

type Reporte = Awaited<ReturnType<typeof getReportesFalla>>[number]
type Equipo = Awaited<ReturnType<typeof getEquiposParaHorometro>>[number]

const PRIORIDAD_COLOR: Record<string, string> = {
  BAJA: 'bg-gray-700/60 text-gray-300',
  MEDIA: 'bg-blue-900/60 text-blue-300',
  ALTA: 'bg-orange-900/60 text-orange-300',
  CRITICA: 'bg-red-900/60 text-red-300',
}

const ROLES_JEFE = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER']
const ROLES_PLANIFICA = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR']

export default function FallasClient({ rolUsuario }: { rolUsuario: string }) {
  const router = useRouter()
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Form nueva falla
  const [equipoId, setEquipoId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [funcion, setFuncion] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [impacto, setImpacto] = useState<'BAJO' | 'MEDIO' | 'ALTO'>('BAJO')
  const [riesgo, setRiesgo] = useState(false)
  const [detener, setDetener] = useState(false)

  const cargar = () => {
    getReportesFalla().then(setReportes)
    getEquiposParaHorometro().then(setEquipos)
  }

  useEffect(cargar, [])

  const resetForm = () => {
    setEquipoId(''); setDescripcion(''); setFuncion(''); setUbicacion('')
    setImpacto('BAJO'); setRiesgo(false); setDetener(false)
  }

  const enviarReporte = (e: React.FormEvent) => {
    e.preventDefault()
    if (!equipoId || !descripcion.trim()) return
    setError('')
    startTransition(async () => {
      try {
        await crearReporteFalla({
          equipoId,
          descripcion: descripcion.trim(),
          funcion: funcion.trim() || undefined,
          ubicacion: ubicacion.trim() || undefined,
          impactoProductivo: impacto,
          riesgoSeguridad: riesgo,
          detencionSolicitada: detener,
        })
        resetForm()
        setMostrarForm(false)
        cargar()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al reportar')
      }
    })
  }

  const accion = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      try {
        await fn()
        cargar()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white uppercase tracking-tight">Reportes de Falla</h1>
        <button onClick={() => setMostrarForm(v => !v)} className="n-btn-primary">
          {mostrarForm ? 'Cerrar' : '+ Reportar falla'}
        </button>
      </div>

      {error && <div className="mb-4 text-sm font-bold" style={{ color: '#f87171' }}>{error}</div>}

      {mostrarForm && (
        <form onSubmit={enviarReporte} className="n-card p-5 space-y-3 mb-6">
          <div>
            <label className="n-label">Equipo</label>
            <select value={equipoId} onChange={e => setEquipoId(e.target.value)} required className="n-input">
              <option value="">Seleccionar equipo...</option>
              {equipos.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.codigo} — {eq.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="n-label">¿Qué pasó?</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} required rows={3} className="n-input" placeholder="Descripción de la falla" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="n-label">Función / labor</label>
              <input value={funcion} onChange={e => setFuncion(e.target.value)} className="n-input" />
            </div>
            <div>
              <label className="n-label">Ubicación</label>
              <input value={ubicacion} onChange={e => setUbicacion(e.target.value)} className="n-input" />
            </div>
          </div>
          <div>
            <label className="n-label">Impacto productivo</label>
            <select value={impacto} onChange={e => setImpacto(e.target.value as 'BAJO' | 'MEDIO' | 'ALTO')} className="n-input">
              <option value="BAJO">Bajo</option>
              <option value="MEDIO">Medio</option>
              <option value="ALTO">Alto</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--n-text)' }}>
            <input type="checkbox" checked={riesgo} onChange={e => setRiesgo(e.target.checked)} />
            Riesgo de seguridad
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--n-text)' }}>
            <input type="checkbox" checked={detener} onChange={e => setDetener(e.target.checked)} />
            Detener el equipo ahora (queda pendiente de validación del jefe de taller)
          </label>
          <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>Fotografías: pendiente de habilitar (falta proveedor de almacenamiento configurado).</p>
          <button type="submit" disabled={isPending} className="n-btn-primary w-full">
            {isPending ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {reportes.length === 0 && <p style={{ color: 'var(--n-text-lt)' }}>Sin reportes activos.</p>}
        {reportes.map(r => (
          <div key={r.id} className="n-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-white">{r.equipo.codigo} — {r.equipo.nombre}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${PRIORIDAD_COLOR[r.prioridad]}`}>{r.prioridad}</span>
            </div>
            <p className="text-sm mb-2" style={{ color: 'var(--n-text)' }}>{r.descripcion}</p>
            <p className="text-xs mb-3" style={{ color: 'var(--n-text-lt)' }}>
              Reportado por {r.reportadoPor.nombre} · {new Date(r.fecha).toLocaleString('es-CL')}
              {r.riesgoSeguridad && ' · ⚠️ Riesgo de seguridad'}
            </p>

            {r.detencionSolicitada && r.detencionConfirmada === null && ROLES_JEFE.includes(rolUsuario) && (
              <div className="flex gap-2 mb-2">
                <button onClick={() => accion(() => validarDetencion(r.id, true))} className="n-btn-primary text-xs px-3 py-1.5">Confirmar detención</button>
                <button onClick={() => accion(() => validarDetencion(r.id, false, 'No amerita detención'))} className="n-btn-ghost text-xs px-3 py-1.5">Rechazar</button>
              </div>
            )}

            {r.estado !== 'CONVERTIDO_OT' && r.estado !== 'CERRADO_SIN_OT' && ROLES_PLANIFICA.includes(rolUsuario) && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => accion(() => convertirReporteEnOT(r.id))} className="n-btn-primary text-xs px-3 py-1.5">Convertir en OT</button>
                <button onClick={() => accion(() => cerrarReporteSinOT(r.id, 'No requiere OT'))} className="n-btn-ghost text-xs px-3 py-1.5">Cerrar sin OT</button>
                {r.prioridad !== 'CRITICA' && (
                  <button onClick={() => accion(() => cambiarPrioridadReporte(r.id, 'CRITICA', 'Reevaluado por jefe/planificador'))} className="n-btn-ghost text-xs px-3 py-1.5">Marcar crítica</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
