'use client'

import { Printer } from 'lucide-react'

export default function EquiposPrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-80"
      style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}
    >
      <Printer size={15} />
      Imprimir
    </button>
  )
}
