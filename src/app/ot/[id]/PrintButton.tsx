'use client'

import { Printer, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

function imprimir(modo: 'simple' | 'full') {
  document.body.dataset.print = modo
  window.print()
  delete document.body.dataset.print
}

export default function PrintButton() {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function cerrar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  return (
    <div className="relative no-print" ref={ref}>
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition"
        style={{ border: '1px solid var(--n-border)', color: 'var(--n-text-mid)' }}
      >
        <Printer size={13} />
        Imprimir
        <ChevronDown size={12} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {abierto && (
        <div
          className="absolute right-0 mt-1 rounded-lg overflow-hidden z-50"
          style={{ border: '1px solid var(--n-border)', backgroundColor: 'var(--n-surface)', minWidth: '160px' }}
        >
          <button
            onClick={() => { imprimir('simple'); setAbierto(false) }}
            className="w-full text-left px-4 py-2.5 text-xs font-bold transition hover:opacity-80"
            style={{ color: 'var(--n-text-mid)', borderBottom: '1px solid var(--n-border)' }}
          >
            Solo OT
          </button>
          <button
            onClick={() => { imprimir('full'); setAbierto(false) }}
            className="w-full text-left px-4 py-2.5 text-xs font-bold transition hover:opacity-80"
            style={{ color: 'var(--n-text-mid)' }}
          >
            OT + Bitácora
          </button>
        </div>
      )}
    </div>
  )
}
