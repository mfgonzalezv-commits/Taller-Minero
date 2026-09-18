import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export interface PageHeaderIndicador {
  label: string
  value: string | number
  color?: string
}

export interface PageHeaderBreadcrumb {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: PageHeaderBreadcrumb[]
  indicadores?: PageHeaderIndicador[]
  /** Botones/links de acción — se apilan a ancho completo en móvil y se alinean a la derecha en escritorio. */
  actions?: ReactNode
}

/**
 * Encabezado reutilizable de página: título + subtítulo + indicadores + acciones,
 * con el mismo comportamiento responsive en todos los módulos (en vez de que cada
 * página repita su propio layout de header). En 390px el bloque de acciones pasa
 * a ancho completo debajo del título; desde `sm:` queda a la derecha, en línea.
 */
export function PageHeader({ title, subtitle, breadcrumb, indicadores, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs font-medium" style={{ color: 'var(--n-text-lt)' }}>
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={13} />}
              {item.href ? (
                <Link href={item.href} className="hover:text-white transition-colors">{item.label}</Link>
              ) : (
                <span className="text-white">{item.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight break-words">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--n-text-lt)' }}>{subtitle}</p>
          )}
          {indicadores && indicadores.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {indicadores.map((ind, i) => (
                <span key={i} className="text-xs sm:text-sm font-bold" style={{ color: ind.color ?? 'var(--n-text-mid)' }}>
                  {ind.value} <span className="font-normal" style={{ color: 'var(--n-text-lt)' }}>{ind.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex flex-col gap-2 [&>*]:w-full sm:flex-row sm:flex-wrap sm:[&>*]:w-auto sm:shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
