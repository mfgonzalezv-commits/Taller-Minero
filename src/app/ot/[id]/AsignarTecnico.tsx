'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { asignarTecnico } from '@/actions/ot'
import { UserCheck } from 'lucide-react'

type Tecnico = { id: string; usuario: { id: string; nombre: string }; especialidades: string[] }

export default function AsignarTecnico({ otId, tecnicoActualId, tecnicos }: {
  otId: string; tecnicoActualId?: string; tecnicos: Tecnico[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [seleccionado, setSeleccionado] = useState(tecnicoActualId ?? '')

  const guardar = () => {
    if (!seleccionado) return
    startTransition(async () => {
      await asignarTecnico(otId, seleccionado)
      router.refresh()
    })
  }

  if (tecnicos.length === 0) return null

  return (
    <div className="n-card space-y-3">
      <div className="flex items-center gap-2">
        <UserCheck size={14} style={{ color: 'var(--n-yellow)' }} />
        <p className="n-label mb-0">Técnico asignado</p>
      </div>

      <select value={seleccionado} onChange={(e) => setSeleccionado(e.target.value)} className="n-input">
        <option value="">Sin asignar</option>
        {tecnicos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.usuario.nombre}{t.especialidades.length > 0 && ` · ${t.especialidades[0]}`}
          </option>
        ))}
      </select>

      {seleccionado !== (tecnicoActualId ?? '') && (
        <button onClick={guardar} disabled={isPending} className="n-btn-primary w-full">
          {isPending ? 'Guardando...' : 'Confirmar asignación'}
        </button>
      )}
    </div>
  )
}
