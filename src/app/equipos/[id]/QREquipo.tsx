'use client'

import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export function QREquipo({ equipoId, codigo }: { equipoId: string; codigo: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const url = `${window.location.origin}/equipos/${equipoId}`
    QRCode.toCanvas(canvasRef.current, url, {
      width: 160,
      margin: 2,
      color: { dark: '#1A1A1A', light: '#FFFFFF' },
    })
  }, [equipoId])

  const descargar = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `QR-${codigo}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow text-center">
      <h2 className="text-sm font-bold uppercase text-slate-900 mb-3">Código QR</h2>

      <div
        className="inline-flex flex-col items-center p-3 rounded-lg"
        style={{ border: '3px solid var(--cat-yellow)' }}
      >
        <canvas ref={canvasRef} className="rounded" />
        <p
          className="mt-2 text-sm font-black tracking-widest"
          style={{ color: 'var(--cat-black)' }}
        >
          {codigo}
        </p>
      </div>

      <button
        onClick={descargar}
        className="mt-3 w-full rounded-lg py-2 text-xs font-bold transition hover:opacity-90"
        style={{ backgroundColor: 'var(--cat-yellow)', color: 'var(--cat-black)' }}
      >
        Descargar QR
      </button>
      <p className="mt-2 text-xs text-slate-400">
        Escanear abre directamente la ficha del equipo
      </p>
    </div>
  )
}
