'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarDiagnostico } from '@/actions/ot'
import { Pencil, Check, X } from 'lucide-react'

type EntradaBitacora = {
  descripcion: string
  tipoIntervencion: string | null
  fechaHora: string
  horaInicio: string | null
  horaTermino: string | null
  personal: string[]
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalToISO(val: string): string | undefined {
  if (!val) return undefined
  return new Date(val + ':00').toISOString()
}

function autoDesde(bitacora: EntradaBitacora[]) {
  const diag = bitacora
    .filter(e => e.tipoIntervencion === 'DIAGNOSTICO')
    .map(e => e.descripcion).join('\n\n')

  const trabajo = bitacora
    .filter(e => ['REPARACION', 'CAMBIO_COMPONENTE', 'MANTENIMIENTO', 'INSPECCION'].includes(e.tipoIntervencion ?? ''))
    .map(e => e.descripcion).join('\n\n')

  const primera = bitacora.find(e => e.horaInicio)
  let fechaInicio = ''
  if (primera) {
    const d = new Date(primera.fechaHora)
    const [hh, mm] = primera.horaInicio!.split(':')
    d.setHours(parseInt(hh), parseInt(mm), 0, 0)
    fechaInicio = toDatetimeLocal(d.toISOString())
  }

  const ultima = [...bitacora].reverse().find(e => e.horaTermino)
  let fechaTermino = ''
  if (ultima) {
    const d = new Date(ultima.fechaHora)
    const [hh, mm] = ultima.horaTermino!.split(':')
    d.setHours(parseInt(hh), parseInt(mm), 0, 0)
    fechaTermino = toDatetimeLocal(d.toISOString())
  }

  return { diag, trabajo, fechaInicio, fechaTermino }
}

export default function EditarDiagnostico({ otId, diagnostico, trabajoEjecutado, fechaInicioTrabajo, fechaTerminoTrabajo, fechaDiagnostico, fechaTrabajo, editable, bitacora }: {
  otId: string
  diagnostico: string | null
  trabajoEjecutado: string | null
  fechaInicioTrabajo: string | null
  fechaTerminoTrabajo: string | null
  fechaDiagnostico: string | null
  fechaTrabajo: string | null
  editable: boolean
  bitacora?: EntradaBitacora[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [diag, setDiag] = useState(diagnostico ?? '')
  const [trabajo, setTrabajo] = useState(trabajoEjecutado ?? '')
  const [fechaInicio, setFechaInicio] = useState(toDatetimeLocal(fechaInicioTrabajo))
  const [fechaTermino, setFechaTermino] = useState(toDatetimeLocal(fechaTerminoTrabajo))
  const [error, setError] = useState('')

  const handleAbrir = () => {
    const auto = bitacora?.length ? autoDesde(bitacora) : null
    setDiag(diagnostico ?? auto?.diag ?? '')
    setTrabajo(trabajoEjecutado ?? auto?.trabajo ?? '')
    setFechaInicio(toDatetimeLocal(fechaInicioTrabajo) || auto?.fechaInicio || '')
    setFechaTermino(toDatetimeLocal(fechaTerminoTrabajo) || auto?.fechaTermino || '')
    setEditando(true)
  }

  const handleGuardar = () => {
    setError('')
    startTransition(async () => {
      try {
        await actualizarDiagnostico({
          otId,
          diagnostico: diag,
          trabajoEjecutado: trabajo,
          fechaInicioTrabajo: datetimeLocalToISO(fechaInicio),
          fechaTerminoTrabajo: datetimeLocalToISO(fechaTermino),
        })
        setEditando(false)
        router.refresh()
      } catch {
        setError('Error al guardar')
      }
    })
  }

  const handleCancelar = () => {
    setDiag(diagnostico ?? '')
    setTrabajo(trabajoEjecutado ?? '')
    setFechaInicio(toDatetimeLocal(fechaInicioTrabajo))
    setFechaTermino(toDatetimeLocal(fechaTerminoTrabajo))
    setEditando(false)
  }

  if (!editando) {
    return (
      <>
        {diagnostico && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Diagnóstico</p>
              {fechaDiagnostico && (
                <p className="text-xs" style={{ color: 'var(--n-text-lt)' }} suppressHydrationWarning>
                  {fmtFecha(fechaDiagnostico)}
                </p>
              )}
            </div>
            <p className="text-sm text-white whitespace-pre-wrap">{diagnostico}</p>
          </div>
        )}
        {trabajoEjecutado && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Trabajo ejecutado</p>
              {fechaTrabajo && (
                <p className="text-xs" style={{ color: 'var(--n-text-lt)' }} suppressHydrationWarning>
                  {fmtFecha(fechaTrabajo)}
                </p>
              )}
            </div>
            <p className="text-sm text-white whitespace-pre-wrap">{trabajoEjecutado}</p>
          </div>
        )}
        {(fechaInicioTrabajo || fechaTerminoTrabajo) && (
          <div className="flex gap-4 text-sm">
            {fechaInicioTrabajo && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--n-text-lt)' }}>Inicio trabajo</p>
                <p className="text-white" suppressHydrationWarning>{fmtFecha(fechaInicioTrabajo)}</p>
              </div>
            )}
            {fechaTerminoTrabajo && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--n-text-lt)' }}>Término trabajo</p>
                <p className="text-white" suppressHydrationWarning>{fmtFecha(fechaTerminoTrabajo)}</p>
              </div>
            )}
          </div>
        )}
        {editable && (
          <button
            onClick={handleAbrir}
            className="flex items-center gap-1.5 text-xs font-bold mt-1 transition-opacity hover:opacity-80"
            style={{ color: 'var(--n-yellow)' }}
          >
            <Pencil size={12} />
            {diagnostico || trabajoEjecutado ? 'Editar' : 'Agregar diagnóstico / trabajo'}
          </button>
        )}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>Diagnóstico</label>
        <textarea
          value={diag}
          onChange={(e) => setDiag(e.target.value)}
          rows={4}
          placeholder="Diagnóstico técnico de la falla..."
          className="n-input resize-none text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>Trabajo ejecutado</label>
        <textarea
          value={trabajo}
          onChange={(e) => setTrabajo(e.target.value)}
          rows={4}
          placeholder="Descripción del trabajo realizado..."
          className="n-input resize-none text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>Inicio trabajo</label>
          <input type="datetime-local" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="n-input text-sm" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--n-text-lt)' }}>Término trabajo</label>
          <input type="datetime-local" value={fechaTermino} onChange={e => setFechaTermino(e.target.value)} className="n-input text-sm" />
        </div>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleCancelar} disabled={isPending} className="n-btn-ghost flex-1 flex items-center justify-center gap-1.5">
          <X size={13} /> Cancelar
        </button>
        <button onClick={handleGuardar} disabled={isPending} className="n-btn-primary flex-1 flex items-center justify-center gap-1.5">
          <Check size={13} /> {isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
