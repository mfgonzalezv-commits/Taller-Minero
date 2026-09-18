'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { LogOut, Menu, X, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Notificacion } from '@/actions/notificaciones'
import { navParaRol } from '@/lib/roles'
import { NotificacionesBell } from './NotificacionesBell'

const ROL_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  JEFE_TALLER_CENTRAL: 'Jefe de Taller Central',
  PLANIFICADOR_CENTRAL: 'Planificador Central',
  JEFE_TALLER:   'Jefe de Taller',
  PLANIFICADOR:  'Planificador',
  MECANICO:      'Mecánico',
  BODEGA:        'Bodeguero',
  COMPRAS:       'Compras',
  GERENCIA:      'Gerencia',
  OPERADOR:      'Operador',
}

interface TopBarProps {
  userName?: string
  userRole?: string
  notificaciones?: Notificacion[]
}

export function TopBar({ userName, userRole, notificaciones = [] }: TopBarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [modulosOpen, setModulosOpen] = useState(false)
  const NAV = navParaRol(userRole ?? '')
  const navPrincipal = NAV.filter(item => item.principal)
  const navSecundarios = NAV.filter(item => !item.principal)
  const secundarioActivo = navSecundarios.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

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

          {/* Nav desktop — accesos principales en línea, el resto bajo "Módulos" para no competir en una sola barra */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {navPrincipal.map((item) => {
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

            {navSecundarios.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setModulosOpen(v => !v)}
                  aria-expanded={modulosOpen}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold tracking-wide transition-colors"
                  style={{
                    color: secundarioActivo ? '#FFFFFF' : 'var(--n-text-mid)',
                    backgroundColor: secundarioActivo ? 'rgba(255,255,255,0.1)' : 'transparent',
                    borderBottom: secundarioActivo ? '2px solid var(--n-yellow)' : '2px solid transparent',
                  }}
                >
                  Módulos <ChevronDown size={14} className={modulosOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
                {modulosOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setModulosOpen(false)} />
                    <div
                      className="absolute left-0 top-full mt-2 z-20 w-56 rounded-lg shadow-xl overflow-hidden py-1"
                      style={{ backgroundColor: 'var(--n-card)', border: '1px solid var(--n-border)' }}
                    >
                      {navSecundarios.map(item => {
                        const active = pathname === item.href || pathname.startsWith(item.href + '/')
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setModulosOpen(false)}
                            className="block px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
                            style={{ color: active ? 'var(--n-yellow)' : 'var(--n-text-mid)' }}
                          >
                            {item.label}
                          </Link>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </nav>

          <div className="flex items-center gap-3 ml-auto">
            <NotificacionesBell notificaciones={notificaciones} />

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
              className="p-2 rounded-md transition-colors hover:bg-white/10 min-h-11 min-w-11 flex items-center justify-center"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              style={{ color: 'var(--n-text-lt)' }}
            >
              <LogOut size={16} />
            </button>

            {/* Hamburger mobile */}
            <button
              className="lg:hidden p-2 rounded-md transition-colors hover:bg-white/10 min-h-11 min-w-11 flex items-center justify-center"
              style={{ color: 'var(--n-text-mid)' }}
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileOpen}
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
          className="fixed inset-x-0 top-14 z-30 lg:hidden py-2 px-4 space-y-1 overflow-y-auto"
          style={{ backgroundColor: 'var(--n-surface)', borderBottom: '1px solid var(--n-border)', maxHeight: 'calc(100vh - 3.5rem)' }}
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
