'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  getEstadosPago,
  prepararEstadoPago,
  aprobarEstadoPago,
  rechazarEstadoPago,
  agregarAjusteManual,
} from '@/actions/estadoPago'

type EstadoPago = Awaited<ReturnType<typeof getEstadosPago>>[number]

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const ROLES_PREPARA = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL']
const ROLES_APRUEBA = ['ADMINISTRADOR', 'GERENCIA']

function exportarCSV(ep: EstadoPago) {
  const filas = [
    ['Equipo', 'Modalidad', 'Tarifa', 'Unidades', 'Monto bruto', 'Horas detención', 'Descuento', 'Monto neto'],
    ...ep.lineas.map(l => [
      l.equipo.codigo, l.modalidad, String(l.tarifa), String(l.cantidadUnidades),
      String(l.montoBruto), String(l.horasDetencion), String(l.descuentoDetencion), String(l.montoNeto),
    ]),
  ]
  const csv = filas.map(f => f.join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `estado-pago-${new Date(ep.periodoInicio).toISOString().slice(0, 10)}.csv`
  link.click()
}

export default function ArriendosClient({ rolUsuario, faenaId }: { rolUsuario: string; faenaId: string }) {
  const router = useRouter()
  const [estados, setEstados] = useState<EstadoPago[]>([])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const cargar = () => { getEstadosPago().then(setEstados) }
  useEffect(cargar, [])

  const accion = (fn: () => Promise<unknown>) => {
    setError('')
    startTransition(async () => {
      try { await fn(); cargar(); router.refresh() }
      catch (err) { setError(err instanceof Error ? err.message : 'Error') }
    })
  }

  return (
    <div className="max-w-4xl print:hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">Arriendos — Estado de Pago</h1>
        {ROLES_PREPARA.includes(rolUsuario) && (
          <button onClick={() => accion(() => prepararEstadoPago(faenaId))} disabled={isPending} className="n-btn-primary sm:self-start">
            {isPending ? 'Preparando...' : 'Preparar periodo actual'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm font-bold" style={{ color: '#f87171' }}>{error}</p>}

      <div className="space-y-4">
        {estados.length === 0 && <p style={{ color: 'var(--n-text-lt)' }}>Sin Estados de Pago preparados todavía.</p>}
        {estados.map(ep => (
          <div key={ep.id} className="n-card p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              <div>
                <p className="font-bold text-white">
                  {new Date(ep.periodoInicio).toLocaleDateString('es-CL')} — {new Date(ep.periodoTermino).toLocaleDateString('es-CL')}
                </p>
                <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                  Estado: <span className="font-bold">{ep.estado}</span>
                  {ep.preparadoPor && ` · Preparado por ${ep.preparadoPor.nombre}`}
                  {ep.aprobadoPor && ` · Aprobado por ${ep.aprobadoPor.nombre}`}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xl font-black" style={{ color: 'var(--n-yellow)' }}>{fmt(Number(ep.totalNeto))}</p>
                <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>Bruto {fmt(Number(ep.totalBruto))} · Desc. {fmt(Number(ep.totalDescuentos))}</p>
              </div>
            </div>

            {/* Tabla — desde sm: hacia arriba */}
            <table className="w-full text-xs mb-3 hidden sm:table">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
                  {['Equipo', 'Modalidad', 'Unidades', 'Bruto', 'Detención', 'Neto'].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-bold uppercase" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ep.lineas.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--n-border)' }}>
                    <td className="px-2 py-1.5 text-white">{l.equipo.codigo}</td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--n-text)' }}>{l.modalidad}</td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--n-text)' }}>{Number(l.cantidadUnidades).toFixed(1)}</td>
                    <td className="px-2 py-1.5" style={{ color: 'var(--n-text)' }}>{fmt(Number(l.montoBruto))}</td>
                    <td className="px-2 py-1.5" style={{ color: '#f87171' }}>{Number(l.horasDetencion).toFixed(1)}h</td>
                    <td className="px-2 py-1.5 font-bold text-white">{fmt(Number(l.montoNeto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Tarjetas por línea — bajo sm: */}
            <div className="sm:hidden mb-3 space-y-2">
              {ep.lineas.map(l => (
                <div key={l.id} className="rounded-lg p-3" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white text-sm">{l.equipo.codigo}</span>
                    <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{l.modalidad} · {Number(l.cantidadUnidades).toFixed(1)} un.</span>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--n-text-mid)' }}>
                    <span>Bruto {fmt(Number(l.montoBruto))}</span>
                    {Number(l.horasDetencion) > 0 && <span style={{ color: '#f87171' }}>{Number(l.horasDetencion).toFixed(1)}h detención</span>}
                  </div>
                  <p className="text-sm font-bold text-white mt-1">Neto {fmt(Number(l.montoNeto))}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => exportarCSV(ep)} className="n-btn-ghost text-xs px-3 py-1.5">Exportar Excel (CSV)</button>
              <button onClick={() => window.print()} className="n-btn-ghost text-xs px-3 py-1.5">Exportar PDF (imprimir)</button>
              {ep.estado === 'PREPARADO' && ROLES_APRUEBA.includes(rolUsuario) && (
                <>
                  <button onClick={() => accion(() => aprobarEstadoPago(ep.id))} disabled={isPending} className="n-btn-primary text-xs px-3 py-1.5">Aprobar</button>
                  <button onClick={() => accion(() => rechazarEstadoPago(ep.id, 'Rechazado por Gerencia'))} disabled={isPending} className="n-btn-ghost text-xs px-3 py-1.5">Rechazar</button>
                </>
              )}
              {ep.estado === 'PREPARADO' && ROLES_PREPARA.includes(rolUsuario) && ep.lineas[0] && (
                <button
                  onClick={() => {
                    const monto = prompt('Monto del ajuste (puede ser negativo):')
                    const motivo = prompt('Motivo del ajuste:')
                    if (monto && motivo) accion(() => agregarAjusteManual(ep.lineas[0].id, Number(monto), motivo))
                  }}
                  disabled={isPending}
                  className="n-btn-ghost text-xs px-3 py-1.5"
                >
                  + Ajuste manual (primera línea)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
