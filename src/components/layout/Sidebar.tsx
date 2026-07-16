'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppStore } from '@/store/appStore'
import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  Wrench,
  Gauge,
  Package,
  ShoppingCart,
  BarChart3,
  Users,
  ClipboardCheck,
  MapPin,
} from 'lucide-react'

const NAV = [
  { label: 'Dashboard',       href: '/dashboard',          icon: LayoutDashboard },
  { label: 'Órdenes de Trabajo', href: '/ot',             icon: ClipboardList },
  { label: 'Equipos',         href: '/equipos',            icon: Truck },
  { label: 'Faenas',          href: '/faenas',             icon: MapPin },
  { label: 'Mantención Prev.',href: '/mantenimiento',      icon: Wrench },
  { label: 'Inspección Diaria', href: '/inspeccion',       icon: ClipboardCheck },
  { label: 'Horómetros',      href: '/terreno/horometro',  icon: Gauge },
  { label: 'Bodega',          href: '/bodega',             icon: Package },
  { label: 'Reportes',        href: '/reportes',           icon: BarChart3 },
  { label: 'Usuarios',        href: '/usuarios',           icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen } = useAppStore()

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-60 flex flex-col transition-transform duration-200
          lg:translate-x-0 lg:static lg:z-auto`}
        style={{
          backgroundColor: 'var(--win-card)',
          borderRight: '1px solid var(--win-border)',
          transform: sidebarOpen ? 'translateX(0)' : undefined,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--win-border)' }}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold"
            style={{ backgroundColor: 'var(--win-blue)' }}
          >
            ERP
          </div>
          <div>
            <p className="text-sm font-semibold leading-none" style={{ color: 'var(--win-text)' }}>ERP Faena</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--win-text-lt)' }}>Taller Minero</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all relative"
                style={
                  active
                    ? {
                        backgroundColor: 'var(--win-blue-lt)',
                        color: 'var(--win-blue)',
                      }
                    : { color: 'var(--win-text-mid)' }
                }
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = '#F0F0F0'
                    e.currentTarget.style.color = 'var(--win-text)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = ''
                    e.currentTarget.style.color = 'var(--win-text-mid)'
                  }
                }}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--win-blue)' }}
                  />
                )}
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="px-5 py-3" style={{ borderTop: '1px solid var(--win-border)' }}>
          <p className="text-xs" style={{ color: 'var(--win-text-lt)' }}>v1.0 · Faena Norte</p>
        </div>
      </aside>
    </>
  )
}
