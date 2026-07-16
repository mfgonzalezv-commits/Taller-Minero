'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Bell, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import type { Notificacion } from '@/actions/notificaciones'
import { navParaRol } from '@/lib/roles'

const ROL_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  JEFE_TALLER:   'Jefe de Taller',
  PLANIFICADOR:  'Planificador',
  MECANICO:      'Mecánico',
  BODEGA:        'Bodeguero',
  COMPRAS:       'Compras',
  GERENCIA:      'Gerencia',
}

interface TopBarProps {
  userName?: string
  userRole?: string
  notificaciones?: Notificacion[]
}

export function TopBar({ userName, userRole, notificaciones = [] }: TopBarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const urgentes = notificaciones.filter((n) => n.urgente).length
  const NAV = navParaRol(userRole ?? '')

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full no-print"
        style={{ backgroundColor: 'rgba(20,20,20,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--n-border)' }}
      >
        <div className="flex h-14 items-center gap-6 px-6">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
            <div
              className="h-9 w-9 rounded flex items-center justify-center text-white text-xs font-black tracking-widest shrink-0"
              style={{ backgroundColor: 'var(--n-red)' }}
            >
              AH
            </div>
            <div className="hidden sm:block">
              <p className="text-white font-black text-sm leading-tight uppercase tracking-tight">Araya Hermanos</p>
              <p className="text-xs leading-tight" style={{ color: 'var(--n-text-lt)' }}>Sistema de control · Taller de Mantención</p>
            </div>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 rounded text-sm font-semibold tracking-wide transition-colors"
                  style={{
                    color: active ? '#FFFFFF' : 'var(--n-text-mid)',
                    backgroundColor: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                    borderBottom: active ? '2px solid var(--n-yellow)' : '2px solid transparent',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-3 ml-auto">
            {/* Notificaciones */}
            <button className="relative p-2 rounded-md transition-colors hover:bg-white/10" style={{ color: 'var(--n-text-mid)' }}>
              <Bell size={18} />
              {urgentes > 0 && (
                <span
                  className="absolute top-1 right-1 h-4 w-4 rounded-full text-white text-xs flex items-center justify-center font-bold"
                  style={{ backgroundColor: 'var(--n-red)', fontSize: '10px' }}
                >
                  {urgentes}
                </span>
              )}
            </button>

            {/* Usuario */}
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="text-right">
                <p className="text-xs font-semibold text-white leading-none">{userName}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>
                  {ROL_LABEL[userRole ?? ''] ?? userRole}
                </p>
              </div>
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: 'var(--n-red)' }}
              >
                {userName?.charAt(0).toUpperCase() ?? '?'}
              </div>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="p-2 rounded-md transition-colors hover:bg-white/10"
              title="Cerrar sesión"
              style={{ color: 'var(--n-text-lt)' }}
            >
              <LogOut size={16} />
            </button>

            {/* Hamburger mobile */}
            <button
              className="lg:hidden p-2 rounded-md transition-colors hover:bg-white/10"
              style={{ color: 'var(--n-text-mid)' }}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Menú mobile desplegable */}
      {mobileOpen && (
        <div
          className="fixed inset-x-0 top-14 z-30 lg:hidden py-2 px-4 space-y-1"
          style={{ backgroundColor: 'var(--n-surface)', borderBottom: '1px solid var(--n-border)' }}
        >
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center px-4 py-3 rounded-md text-sm font-medium transition-colors"
                style={{
                  color: active ? '#FFFFFF' : 'var(--n-text-mid)',
                  backgroundColor: active ? 'rgba(229,9,20,0.15)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
