'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Notificacion } from '@/actions/notificaciones'

const TIPO_ICON: Record<string, string> = {
  OT_ESTANCADA: '⏸',
  STOCK_BAJO: '📦',
  MANTENCION_VENCIDA: '🔴',
  MANTENCION_PROXIMA: '🟡',
  PM_VENCIDA: '🔧',
  PM_PROXIMA: '⚙️',
}

export function NotificacionesBell({ notificaciones }: { notificaciones: Notificacion[] }) {
  const [abierto, setAbierto] = useState(false)
  const urgentes = notificaciones.filter((n) => n.urgente).length
  const total = notificaciones.length

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(!abierto)}
        className="relative p-2 rounded-md transition-colors hover:bg-white/10"
        style={{ color: total > 0 ? 'var(--cat-yellow)' : 'var(--cat-grey-mid)' }}
      >
        <span className="text-lg leading-none">🔔</span>
        {total > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-xs font-black"
            style={{ backgroundColor: urgentes > 0 ? '#DC2626' : 'var(--cat-yellow)', color: urgentes > 0 ? 'white' : 'var(--cat-black)' }}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div
            className="absolute right-0 top-full mt-2 z-20 w-80 rounded-lg shadow-xl overflow-hidden"
            style={{ backgroundColor: 'var(--cat-black)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-white/10"
            >
              <p className="text-sm font-bold text-white">Notificaciones</p>
              {total > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--cat-yellow)', color: 'var(--cat-black)' }}
                >
                  {total}
                </span>
              )}
            </div>

            {total === 0 ? (
              <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--cat-grey-mid)' }}>
                Sin alertas pendientes
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                {notificaciones.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setAbierto(false)}
                    className="flex gap-3 px-4 py-3 hover:bg-white/5 transition"
                  >
                    <span className="text-base mt-0.5 flex-shrink-0">{TIPO_ICON[n.tipo]}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${n.urgente ? 'text-red-400' : 'text-white'}`}>
                        {n.titulo}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--cat-grey-mid)' }}>
                        {n.mensaje}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
