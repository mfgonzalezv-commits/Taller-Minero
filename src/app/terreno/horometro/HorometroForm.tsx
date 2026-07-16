'use client'

import { useState, useEffect, useTransition } from 'react'
import { getEquiposParaHorometro, registrarHorometro } from '@/actions/horometro'

type Equipo = Awaited<ReturnType<typeof getEquiposParaHorometro>>[number]

export default function HorometroForm() {
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [equipoId, setEquipoId] = useState('')
  const [horometro, setHorometro] = useState('')
  const [kilometraje, setKilometraje] = useState('')
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getEquiposParaHorometro().then(setEquipos)
  }, [])

  const equipoSel = equipos.find(e => e.id === equipoId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!equipoId) return
    setError('')
    setOk(false)

    startTransition(async () => {
      try {
        await registrarHorometro({
          equipoId,
          horometro: horometro ? Number(horometro) : undefined,
          kilometraje: kilometraje ? Number(kilometraje) : undefined,
        })
        setHorometro('')
        setKilometraje('')
        setOk(true)
        const lista = await getEquiposParaHorometro()
        setEquipos(lista)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al registrar')
      }
    })
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-6">Registrar Horómetro / Km</h1>

      <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Equipo</label>
          <select
            value={equipoId}
            onChange={e => { setEquipoId(e.target.value); setOk(false) }}
            required
            className="n-input"
          >
            <option value="">Seleccionar equipo...</option>
            {equipos.map(eq => (
              <option key={eq.id} value={eq.id}>{eq.codigo} — {eq.nombre}</option>
            ))}
          </select>
        </div>

        {equipoSel && (
          <div className="rounded-lg px-4 py-3 text-sm space-y-1" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
            <p style={{ color: 'var(--n-text-mid)' }}>Horómetro actual: <span className="font-bold text-white">{Number(equipoSel.horometroActual)} h</span></p>
            <p style={{ color: 'var(--n-text-mid)' }}>Km actual: <span className="font-bold text-white">{Number(equipoSel.kilometrajeActual)} km</span></p>
            <p style={{ color: 'var(--n-text-mid)' }}>Estado: <span className="font-bold text-white">{equipoSel.estado}</span></p>
          </div>
        )}

        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Horómetro nuevo (horas)</label>
          <input type="number" step="0.1" value={horometro} onChange={e => setHorometro(e.target.value)} placeholder="0.0" className="n-input" />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Kilometraje nuevo (km)</label>
          <input type="number" step="1" value={kilometraje} onChange={e => setKilometraje(e.target.value)} placeholder="0" className="n-input" />
        </div>

        {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}
        {ok && <p className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>✓ Registrado correctamente</p>}

        <button type="submit" disabled={isPending || !equipoId} className="n-btn-primary w-full">
          {isPending ? 'Guardando...' : 'Registrar'}
        </button>
      </form>
    </div>
  )
}
