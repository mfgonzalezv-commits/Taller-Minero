'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarEquipo } from '@/actions/equipos'
import type { TipoEquipo } from '@prisma/client'

const TIPOS: { value: TipoEquipo; label: string }[] = [
  { value: 'CAMION', label: 'Camión' },
  { value: 'MAQUINARIA', label: 'Maquinaria' },
  { value: 'LIVIANO', label: 'Liviano' },
  { value: 'OTRO', label: 'Otro' },
]

type Equipo = {
  id: string; nombre: string; tipo: TipoEquipo; marca: string | null
  modelo: string | null; anio: number | null; ubicacionActual: string | null
  costoHoraDetencion: { toString(): string }
}

export default function EditarEquipoForm({ equipo }: { equipo: Equipo }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [nombre, setNombre] = useState(equipo.nombre)
  const [tipo, setTipo] = useState<TipoEquipo>(equipo.tipo)
  const [marca, setMarca] = useState(equipo.marca ?? '')
  const [modelo, setModelo] = useState(equipo.modelo ?? '')
  const [anio, setAnio] = useState(equipo.anio?.toString() ?? '')
  const [ubicacion, setUbicacion] = useState(equipo.ubicacionActual ?? '')
  const [costoHora, setCostoHora] = useState(Number(equipo.costoHoraDetencion.toString()).toString())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        await actualizarEquipo(equipo.id, {
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
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="n-card space-y-5">
      {/* Tipo */}
      <div>
        <label className="n-label">Tipo de equipo</label>
        <div className="flex gap-2">
          {TIPOS.map((t) => (
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

      <div>
        <label className="n-label">Nombre *</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required className="n-input" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="n-label">Marca</label>
          <input type="text" value={marca} onChange={(e) => setMarca(e.target.value)} className="n-input" />
        </div>
        <div>
          <label className="n-label">Modelo</label>
          <input type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} className="n-input" />
        </div>
        <div>
          <label className="n-label">Año</label>
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} min="1990" max="2030" className="n-input" />
        </div>
      </div>

      <div>
        <label className="n-label">Ubicación actual</label>
        <input type="text" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} className="n-input" />
      </div>

      <div>
        <label className="n-label">Costo por hora detenido (CLP)</label>
        <input type="number" value={costoHora} onChange={(e) => setCostoHora(e.target.value)} min="0" className="n-input" />
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={() => router.back()} className="n-btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={isPending} className="n-btn-primary flex-1">
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
