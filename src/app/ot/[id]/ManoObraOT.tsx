'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { agregarManoObra, eliminarManoObra } from '@/actions/manoObra'
import { HardHat, Plus, X } from 'lucide-react'

type Entrada = {
  id: string
  nombre: string
  horasNormales: { toString(): string }
  horasExtra: { toString(): string }
  tarifaNormal: { toString(): string }
  tarifaExtra: { toString(): string }
  total: { toString(): string }
}

type TrabajadorDirecto = {
  id: string
  nombre: string
  cargo: string | null
  sueldoBruto: { toString(): string }
  horasMensuales: number
  tasaLeyesSociales: { toString(): string }
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function costoHora(t: TrabajadorDirecto): number {
  const bruto = Number(t.sueldoBruto.toString())
  const tasa = Number(t.tasaLeyesSociales.toString())
  const horas = t.horasMensuales
  if (horas === 0) return 0
  return Math.round((bruto * (1 + tasa)) / horas)
}

export default function ManoObraOT({ otId, entradas, trabajadores, editable }: {
  otId: string
  entradas: Entrada[]
  trabajadores: TrabajadorDirecto[]
  editable: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [modoRegistrado, setModoRegistrado] = useState(true)

  const [trabajadorId, setTrabajadorId] = useState('')
  const [nombreLibre, setNombreLibre] = useState('')
  const [horasNormales, setHorasNormales] = useState('8')
  const [horasExtra, setHorasExtra] = useState('0')
  const [tarifaNormal, setTarifaNormal] = useState('')
  const [tarifaExtra, setTarifaExtra] = useState('')
  const [error, setError] = useState('')

  const totalManoObra = entradas.reduce((acc, e) => acc + Number(e.total.toString()), 0)
  const trabajadorSeleccionado = trabajadores.find(t => t.id === trabajadorId)

  const handleSelectTrabajador = (id: string) => {
    setTrabajadorId(id)
    const t = trabajadores.find(x => x.id === id)
    if (t) {
      const ch = costoHora(t)
      setTarifaNormal(ch.toString())
      setTarifaExtra(Math.round(ch * 1.5).toString())
    }
  }

  const totalPreview =
    (Number(horasNormales) || 0) * (Number(tarifaNormal) || 0) +
    (Number(horasExtra) || 0) * (Number(tarifaExtra) || 0)

  const resetForm = () => {
    setTrabajadorId(''); setNombreLibre(''); setHorasNormales('8')
    setHorasExtra('0'); setTarifaNormal(''); setTarifaExtra('')
    setError(''); setMostrarForm(false)
  }

  const handleAgregar = (e: React.FormEvent) => {
    e.preventDefault()
    const nombre = modoRegistrado
      ? (trabajadorSeleccionado?.nombre ?? '')
      : nombreLibre

    if (!nombre) { setError('Ingresa un nombre'); return }
    setError('')

    startTransition(async () => {
      try {
        await agregarManoObra({
          otId,
          nombre,
          trabajadorId: modoRegistrado ? trabajadorId || undefined : undefined,
          horasNormales: Number(horasNormales) || 0,
          horasExtra: Number(horasExtra) || 0,
          tarifaNormal: Number(tarifaNormal) || 0,
          tarifaExtra: Number(tarifaExtra) || 0,
        })
        resetForm()
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  const handleEliminar = (id: string) => {
    startTransition(async () => { await eliminarManoObra(id, otId); router.refresh() })
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
        <div className="flex items-center gap-2">
          <HardHat size={14} style={{ color: 'var(--n-yellow)' }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
            Mano de obra
          </p>
          {entradas.length > 0 && (
            <span className="text-xs font-bold" style={{ color: 'var(--n-text-mid)' }}>· {fmt(totalManoObra)}</span>
          )}
        </div>
        {editable && !mostrarForm && (
          <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
            <Plus size={13} /> Agregar
          </button>
        )}
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div className="px-5 py-4 space-y-3" style={{ borderBottom: '1px solid var(--n-border)', backgroundColor: 'var(--n-bg)' }}>
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--n-surface)' }}>
            {[{ label: 'Trabajador registrado', v: true }, { label: 'Ayudante / externo', v: false }].map(({ label, v }) => (
              <button key={label} type="button" onClick={() => setModoRegistrado(v)}
                className="flex-1 rounded-md py-1.5 text-xs font-bold transition-all"
                style={{
                  backgroundColor: modoRegistrado === v ? 'var(--n-yellow)' : 'transparent',
                  color: modoRegistrado === v ? '#1A1A1A' : 'var(--n-text-lt)',
                }}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleAgregar} className="space-y-3">
            {modoRegistrado ? (
              <select value={trabajadorId} onChange={(e) => handleSelectTrabajador(e.target.value)} required className="n-input">
                <option value="">Seleccionar trabajador...</option>
                {trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}{t.cargo ? ` — ${t.cargo}` : ''} ({fmt(costoHora(t))}/hr)
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" value={nombreLibre} onChange={(e) => setNombreLibre(e.target.value)}
                required placeholder="Nombre del ayudante o externo" className="n-input" />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>
                  Tarifa normal ($/hr)
                </label>
                <input type="number" value={tarifaNormal} onChange={(e) => setTarifaNormal(e.target.value)}
                  required min="0" placeholder="8500" className="n-input" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>
                  Tarifa hora extra ($/hr)
                </label>
                <input type="number" value={tarifaExtra} onChange={(e) => setTarifaExtra(e.target.value)}
                  min="0" placeholder="12750" className="n-input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>
                  Horas normales
                </label>
                <input type="number" value={horasNormales} onChange={(e) => setHorasNormales(e.target.value)}
                  required min="0" step="0.5" className="n-input" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>
                  Horas extra
                </label>
                <input type="number" value={horasExtra} onChange={(e) => setHorasExtra(e.target.value)}
                  min="0" step="0.5" className="n-input" />
              </div>
            </div>

            {totalPreview > 0 && (
              <div className="flex justify-between text-xs rounded px-3 py-2" style={{ backgroundColor: 'var(--n-surface)' }}>
                <span style={{ color: 'var(--n-text-lt)' }}>
                  {horasNormales}h × {fmt(Number(tarifaNormal))} + {horasExtra}h extra × {fmt(Number(tarifaExtra) || 0)}
                </span>
                <span className="font-black" style={{ color: 'var(--n-yellow)' }}>{fmt(totalPreview)}</span>
              </div>
            )}

            {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={resetForm} className="n-btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={isPending} className="n-btn-primary flex-1">
                {isPending ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      {entradas.length === 0 ? (
        <p className="px-5 py-5 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin mano de obra registrada</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
              {['Persona', 'H. Norm.', 'H. Extra', 'T. Normal', 'T. Extra', 'Total', ''].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entradas.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--n-border)' }}>
                <td className="px-4 py-3 font-medium text-white">{e.nombre}</td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{Number(e.horasNormales.toString())} h</td>
                <td className="px-4 py-3 text-sm" style={{ color: Number(e.horasExtra.toString()) > 0 ? 'var(--n-yellow)' : 'var(--n-text-mid)' }}>
                  {Number(e.horasExtra.toString()) > 0 ? `${Number(e.horasExtra.toString())} h` : '—'}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{fmt(Number(e.tarifaNormal.toString()))}</td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>
                  {Number(e.tarifaExtra.toString()) > 0 ? fmt(Number(e.tarifaExtra.toString())) : '—'}
                </td>
                <td className="px-4 py-3 font-bold text-white">{fmt(Number(e.total.toString()))}</td>
                <td className="px-4 py-3">
                  {editable && (
                    <button onClick={() => handleEliminar(e.id)} disabled={isPending} className="hover:opacity-80" style={{ color: 'var(--n-text-lt)' }}>
                      <X size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid var(--n-border)' }}>
              <td colSpan={5} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right" style={{ color: 'var(--n-text-lt)' }}>Total mano de obra directa</td>
              <td className="px-4 py-3 font-black text-white">{fmt(totalManoObra)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
