'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardList, Truck, Wrench, Gauge } from 'lucide-react'

const NAV = [
  { label: 'Inicio',     href: '/dashboard',         icon: LayoutDashboard },
  { label: 'OTs',        href: '/ot',                icon: ClipboardList },
  { label: 'Equipos',   href: '/equipos',            icon: Truck },
  { label: 'Mantención',href: '/mantenimiento',      icon: Wrench },
  { label: 'Horómetro', href: '/terreno/horometro',  icon: Gauge },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-20 flex lg:hidden"
      style={{
        backgroundColor: 'var(--win-card)',
        borderTop: '1px solid var(--win-border)',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors"
            style={{ color: active ? 'var(--win-blue)' : 'var(--win-text-lt)' }}
          >
            <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
