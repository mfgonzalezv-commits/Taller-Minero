'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'

type FilaEquipo = {
  equipoId: string
  codigo: string
  nombre: string
  tipo: string
  otsTotal: number
  otsCerradas: number
  minDetencion: number
  costoDetencion: number
  costoRepuestos: number
}

type Equipo = { id: string; codigo: string; nombre: string }

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const horas = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function ReportesClient({
  equipos,
  resumen,
  totales,
  filtros,
}: {
  equipos: Equipo[]
  resumen: FilaEquipo[]
  totales: { otsTotal: number; minDetencion: number; costoDetencion: number; costoRepuestos: number }
  filtros: { desde: string; hasta: string; equipoId: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [desde, setDesde] = useState(filtros.desde)
  const [hasta, setHasta] = useState(filtros.hasta)
  const [equipoId, setEquipoId] = useState(filtros.equipoId)

  const aplicar = () => {
    const p = new URLSearchParams()
    if (desde) p.set('desde', desde)
    if (hasta) p.set('hasta', hasta)
    if (equipoId) p.set('equipoId', equipoId)
    router.push(`${pathname}?${p.toString()}`)
  }

  const exportarCSV = () => {
    const cabecera = ['Código', 'Nombre', 'OTs total', 'OTs cerradas', 'Horas detenido', 'Costo detención', 'Costo repuestos', 'Total']
    const filas = resumen.map((r) => [
      r.codigo,
      r.nombre,
      r.otsTotal,
      r.otsCerradas,
      (r.minDetencion / 60).toFixed(1),
      r.costoDetencion,
      r.costoRepuestos,
      r.costoDetencion + r.costoRepuestos,
    ])
    const csv = [cabecera, ...filas].map((f) => f.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-costos-${desde}-${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="rounded-lg bg-white p-5 shadow flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Equipo</label>
          <select
            value={equipoId}
            onChange={(e) => setEquipoId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Todos los equipos</option>
            {equipos.map((e) => (
              <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>
            ))}
          </select>
        </div>
        <button
          onClick={aplicar}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Filtrar
        </button>
        <button
          onClick={exportarCSV}
          disabled={resumen.length === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow text-center">
          <p className="text-xs text-slate-500">OTs en período</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totales.otsTotal}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow text-center">
          <p className="text-xs text-slate-500">Horas detenidas</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{(totales.minDetencion / 60).toFixed(0)} h</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow text-center">
          <p className="text-xs text-slate-500">Costo detención</p>
          <p className="text-lg font-bold text-red-600 mt-1">{fmt(totales.costoDetencion)}</p>
        </div>
        <div className="rounded-lg bg-white p-5 shadow text-center">
          <p className="text-xs text-slate-500">Costo total (det. + rep.)</p>
          <p className="text-lg font-bold text-red-700 mt-1">{fmt(totales.costoDetencion + totales.costoRepuestos)}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg bg-white shadow overflow-hidden">
        {resumen.length === 0 ? (
          <p className="px-6 py-8 text-center text-slate-500">Sin datos para el período seleccionado</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Equipo</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">OTs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">H. Detenido</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Costo Det.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Repuestos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumen.map((r) => {
                const total = r.costoDetencion + r.costoRepuestos
                return (
                  <tr key={r.equipoId} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{r.codigo}</p>
                      <p className="text-xs text-slate-500">{r.nombre}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-slate-900">{r.otsTotal}</span>
                      {r.otsCerradas < r.otsTotal && (
                        <span className="text-xs text-orange-500 ml-1">({r.otsTotal - r.otsCerradas} activas)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{horas(r.minDetencion)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(r.costoDetencion)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(r.costoRepuestos)}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(total)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium">
              <tr>
                <td className="px-5 py-3 text-slate-900">Total</td>
                <td className="px-4 py-3 text-center text-slate-900">{totales.otsTotal}</td>
                <td className="px-4 py-3 text-right text-slate-900">{horas(totales.minDetencion)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{fmt(totales.costoDetencion)}</td>
                <td className="px-4 py-3 text-right text-slate-900">{fmt(totales.costoRepuestos)}</td>
                <td className="px-4 py-3 text-right font-bold text-red-700">{fmt(totales.costoDetencion + totales.costoRepuestos)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
