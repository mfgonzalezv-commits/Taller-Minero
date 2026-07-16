'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearEquipo } from '@/actions/equipos'
import type { TipoEquipo } from '@prisma/client'

const TIPOS: { value: TipoEquipo; label: string }[] = [
  { value: 'CAMION',    label: 'Camión' },
  { value: 'MAQUINARIA', label: 'Maquinaria' },
  { value: 'LIVIANO',  label: 'Liviano' },
  { value: 'OTRO',     label: 'Otro' },
]

export default function NuevoEquipoForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [tipo, setTipo] = useState<TipoEquipo>('CAMION')
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [anio, setAnio] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [costoHora, setCostoHora] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        const equipo = await crearEquipo({
          codigo: codigo.toUpperCase(),
          nombre,
          tipo,
          marca: marca || undefined,
          modelo: modelo || undefined,
          anio: anio ? Number(anio) : undefined,
          ubicacionActual: ubicacion || undefined,
          costoHoraDetencion: costoHora ? Number(costoHora) : 0,
        })
        router.push(`/equipos/${equipo.id}`)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear equipo')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tipo */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{ color: 'var(--n-text-lt)' }}>Tipo de equipo *</label>
        <div className="flex gap-2">
          {TIPOS.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTipo(t.value)}
              className="flex-1 rounded-md border py-2 text-xs font-bold uppercase tracking-wider transition"
              style={{
                borderColor: tipo === t.value ? 'var(--n-yellow)' : 'var(--n-border)',
                color: tipo === t.value ? 'var(--n-yellow)' : 'var(--n-text-lt)',
                backgroundColor: tipo === t.value ? 'rgba(255,209,0,0.08)' : 'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Identificación */}
      <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>Identificación</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Código *</label>
            <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)} required placeholder="CAM-001" className="n-input uppercase" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required placeholder="Camión Volquete N°1" className="n-input" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Marca</label>
            <input type="text" value={marca} onChange={e => setMarca(e.target.value)} placeholder="Volvo" className="n-input" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Modelo</label>
            <input type="text" value={modelo} onChange={e => setModelo(e.target.value)} placeholder="FH16" className="n-input" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Año</label>
            <input type="number" value={anio} onChange={e => setAnio(e.target.value)} placeholder="2020" min="1990" max="2030" className="n-input" />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Ubicación actual</label>
          <input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Patio Principal" className="n-input" />
        </div>
      </div>

      {/* Costo detención */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Costo por hora detenido (CLP)</label>
        <input type="number" value={costoHora} onChange={e => setCostoHora(e.target.value)} placeholder="500000" min="0" className="n-input" />
        <p className="text-xs mt-1.5" style={{ color: 'var(--n-text-lt)' }}>Se usa para calcular el costo total cuando el equipo tiene una OT abierta.</p>
      </div>

      {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()} className="n-btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={isPending} className="n-btn-primary flex-1">
          {isPending ? 'Guardando...' : 'Agregar equipo'}
        </button>
      </div>
    </form>
  )
}
