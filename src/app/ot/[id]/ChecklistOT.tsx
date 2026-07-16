'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleChecklistItem } from '@/actions/ot'
import { CheckSquare, Square, ClipboardCheck } from 'lucide-react'

type Item = {
  id: string
  descripcion: string
  codigo: string | null
  cantidad: number | null
  unidad: string | null
  obligatorio: boolean
  completado: boolean
  completadoAt: string | null
  completadoPor: string | null
  orden: number
}

export default function ChecklistOT({
  otId,
  items,
  editable,
}: {
  otId: string
  items: Item[]
  editable: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const obligatorios = items.filter(i => i.obligatorio)
  const completadosOblig = obligatorios.filter(i => i.completado).length
  const totalCompletados = items.filter(i => i.completado).length
  const porcentaje = items.length > 0 ? Math.round((totalCompletados / items.length) * 100) : 0
  const todoObligatorioOk = obligatorios.length === 0 || completadosOblig === obligatorios.length

  const toggle = (itemId: string, actual: boolean) => {
    if (!editable) return
    startTransition(async () => {
      await toggleChecklistItem(itemId, !actual)
      router.refresh()
    })
  }

  if (items.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={15} color="var(--n-yellow)" />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              Checklist de mantención
            </p>
          </div>
          <span className="text-xs font-bold" style={{ color: todoObligatorioOk ? '#4ade80' : 'var(--n-text-lt)' }}>
            {totalCompletados}/{items.length} · {porcentaje}%
          </span>
        </div>
        {/* Barra de progreso */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--n-bg)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${porcentaje}%`,
              backgroundColor: porcentaje === 100 ? '#4ade80' : todoObligatorioOk ? 'var(--n-yellow)' : 'var(--n-red)',
            }}
          />
        </div>
        {!todoObligatorioOk && (
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--n-red)' }}>
            {obligatorios.length - completadosOblig} ítem{obligatorios.length - completadosOblig > 1 ? 's' : ''} obligatorio{obligatorios.length - completadosOblig > 1 ? 's' : ''} pendiente{obligatorios.length - completadosOblig > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Items */}
      <div>
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => toggle(item.id, item.completado)}
            className={`flex items-start gap-3 px-5 py-3 transition-colors ${editable ? 'cursor-pointer hover:bg-white/5' : ''} ${item.completado ? 'opacity-60' : ''}`}
            style={{ borderBottom: '1px solid var(--n-border)' }}
          >
            {/* Checkbox */}
            <div className="mt-0.5 shrink-0">
              {item.completado
                ? <CheckSquare size={16} style={{ color: '#4ade80' }} />
                : <Square size={16} style={{ color: item.obligatorio ? 'var(--n-text-mid)' : 'var(--n-border)' }} />
              }
            </div>

            {/* Contenido */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.completado ? 'line-through' : 'text-white'}`}
                style={{ color: item.completado ? 'var(--n-text-lt)' : undefined }}>
                {item.descripcion}
              </p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {item.codigo && (
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--n-bg)', color: 'var(--n-text-mid)' }}>
                    {item.codigo}
                  </span>
                )}
                {item.cantidad != null && (
                  <span className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
                    {item.cantidad} {item.unidad || 'un'}
                  </span>
                )}
                {!item.obligatorio && (
                  <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>(opcional)</span>
                )}
                {item.completado && item.completadoAt && (
                  <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                    ✓ {new Date(item.completadoAt).toLocaleDateString('es-CL')}
                    {item.completadoPor ? ` · ${item.completadoPor}` : ''}
                  </span>
                )}
              </div>
            </div>

            {isPending && <div className="w-2 h-2 rounded-full animate-pulse shrink-0 mt-1.5" style={{ backgroundColor: 'var(--n-yellow)' }} />}
          </div>
        ))}
      </div>
    </div>
  )
}
