'use client'

import { useAppStore } from '@/store/appStore'
import { signOut } from 'next-auth/react'
import { NotificacionesBell } from './NotificacionesBell'
import { Menu, LogOut } from 'lucide-react'
import type { Notificacion } from '@/actions/notificaciones'

interface HeaderProps {
  userName?: string
  userRole?: string
  notificaciones?: Notificacion[]
}

const ROL_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  JEFE_TALLER:   'Jefe de Taller',
  PLANIFICADOR:  'Planificador',
  MECANICO:      'Mecánico',
  BODEGA:        'Bodeguero',
  COMPRAS:       'Compras',
  GERENCIA:      'Gerencia',
}

export function Header({ userName, userRole, notificaciones = [] }: HeaderProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <header
      className="sticky top-0 z-10 flex h-12 items-center gap-3 px-4"
      style={{
        backgroundColor: 'var(--win-card)',
        borderBottom: '1px solid var(--win-border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-1.5 rounded-md transition-colors hover:bg-gray-100"
        aria-label="Abrir menú"
        style={{ color: 'var(--win-text-mid)' }}
      >
        <Menu size={18} />
      </button>

      <div className="flex-1" />

      <NotificacionesBell notificaciones={notificaciones} />

      <div className="flex items-center gap-2.5">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-semibold leading-none" style={{ color: 'var(--win-text)' }}>{userName}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--win-text-lt)' }}>
            {ROL_LABEL[userRole ?? ''] ?? userRole}
          </p>
        </div>

        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: 'var(--win-blue)' }}
        >
          {userName?.charAt(0).toUpperCase() ?? '?'}
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="p-1.5 rounded-md transition-colors hover:bg-gray-100"
          title="Cerrar sesión"
          style={{ color: 'var(--win-text-lt)' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
