'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { validarTecnicamente, confirmarReincidencia } from '@/actions/ot'

export default function ValidacionOT({
  otId,
  estado,
  yaValidada,
  reincidenciaPendiente,
  puedeValidar,
}: {
  otId: string
  estado: string
  yaValidada: boolean
  reincidenciaPendiente: boolean
  puedeValidar: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!puedeValidar || (estado !== 'EN_VALIDACION' && !reincidenciaPendiente)) return null

  const accion = (fn: () => Promise<void>) => startTransition(async () => { await fn(); router.refresh() })

  return (
    <div className="rounded-lg p-3 mb-4 flex flex-wrap items-center gap-3" style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.3)' }}>
      {estado === 'EN_VALIDACION' && !yaValidada && (
        <button disabled={isPending} onClick={() => accion(() => validarTecnicamente(otId))} className="n-btn-primary text-xs px-3 py-1.5">
          Validar técnicamente
        </button>
      )}
      {estado === 'EN_VALIDACION' && yaValidada && (
        <span className="text-xs font-bold" style={{ color: '#c084fc' }}>✓ Validada técnicamente</span>
      )}
      {reincidenciaPendiente && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: '#fbbf24' }}>⚠️ Posible reincidencia</span>
          <button disabled={isPending} onClick={() => accion(() => confirmarReincidencia(otId, true))} className="n-btn-ghost text-xs px-2 py-1">Confirmar</button>
          <button disabled={isPending} onClick={() => accion(() => confirmarReincidencia(otId, false))} className="n-btn-ghost text-xs px-2 py-1">Descartar</button>
        </div>
      )}
    </div>
  )
}
