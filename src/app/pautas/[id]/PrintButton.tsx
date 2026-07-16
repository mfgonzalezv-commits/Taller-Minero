'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition hover:opacity-80"
      style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}
    >
      <Printer size={15} /> Imprimir pauta
    </button>
  )
}
