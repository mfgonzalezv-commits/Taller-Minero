'use client'

import { Timer } from 'lucide-react'
import { ESTADO_OT_CONFIG } from '@/lib/constants'
import type { EstadoOT } from '@prisma/client'

// ─── Umbrales por estado (en minutos) ────────────────────────────────────────
// null = sin umbral definido aún
// Cuando se definan, el sistema marcará en amarillo (>= umbral) o rojo (>= umbral * 2)
const UMBRALES_MIN: Partial<Record<EstadoOT, number | null>> = {
  ABIERTA:              null,
  EN_DIAGNOSTICO:       null,
  DIAGNOSTICADO:        null,
  REPARACION_PROGRAMADA:null,
  LISTO_PARA_REPARAR:   null,
  EN_REPARACION:        null,
  ESPERA_REPUESTO:      null,
  EN_VALIDACION:        null,
}

type RegistroEstado = {
  estado: string
  inicio: string   // ISO
  fin: string | null  // null = estado actual (abierto)
  minutosTotal: number
  enCurso: boolean
}

type Props = {
  historial: {
    fechaCambio: string
    estadoNuevo: string
    estadoAnterior: string | null
    tiempoEnEstadoMin: number
  }[]
  estadoActual: string
  fechaCreacion: string
}

function formatMin(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function getAlerta(estado: string, minutos: number): 'ok' | 'alerta' | 'critico' | 'sin-umbral' {
  const umbral = UMBRALES_MIN[estado as EstadoOT]
  if (umbral === undefined || umbral === null) return 'sin-umbral'
  if (minutos >= umbral * 2) return 'critico'
  if (minutos >= umbral) return 'alerta'
  return 'ok'
}

export default function TiemposEstadosOT({ historial, estadoActual, fechaCreacion }: Props) {
  const ahora = new Date()

  // Construir tabla de períodos a partir del historial
  const periodos: RegistroEstado[] = []

  if (historial.length === 0) {
    // Solo el estado actual, desde creación
    const minutos = Math.round((ahora.getTime() - new Date(fechaCreacion).getTime()) / 60000)
    periodos.push({ estado: estadoActual, inicio: fechaCreacion, fin: null, minutosTotal: minutos, enCurso: true })
  } else {
    // Primer estado: desde creación hasta primer cambio
    periodos.push({
      estado: historial[0].estadoAnterior ?? estadoActual,
      inicio: fechaCreacion,
      fin: historial[0].fechaCambio,
      minutosTotal: historial[0].tiempoEnEstadoMin,
      enCurso: false,
    })

    // Estados intermedios
    for (let i = 1; i < historial.length; i++) {
      periodos.push({
        estado: historial[i].estadoAnterior ?? historial[i - 1].estadoNuevo,
        inicio: historial[i - 1].fechaCambio,
        fin: historial[i].fechaCambio,
        minutosTotal: historial[i].tiempoEnEstadoMin,
        enCurso: false,
      })
    }

    // Estado actual (abierto)
    if (estadoActual !== 'CERRADA') {
      const ultimoCambio = historial[historial.length - 1].fechaCambio
      const minActual = Math.round((ahora.getTime() - new Date(ultimoCambio).getTime()) / 60000)
      periodos.push({
        estado: estadoActual,
        inicio: ultimoCambio,
        fin: null,
        minutosTotal: minActual,
        enCurso: true,
      })
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const totalMin = periodos.reduce((acc, p) => acc + p.minutosTotal, 0)

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
        <div className="flex items-center gap-2">
          <Timer size={14} style={{ color: 'var(--n-yellow)' }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
            Tiempos por estado
          </p>
        </div>
        <span className="text-xs font-bold" style={{ color: 'var(--n-text-mid)' }}>
          Total: {formatMin(totalMin)}
        </span>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
            {['Estado', 'Inicio', 'Fin', 'Duración'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodos.map((p, i) => {
            const cfg = ESTADO_OT_CONFIG[p.estado as EstadoOT]
            const alerta = getAlerta(p.estado, p.minutosTotal)

            const bgRow = p.enCurso ? 'rgba(255,209,0,0.04)' : 'transparent'
            const durColor = alerta === 'critico' ? 'var(--n-red)'
              : alerta === 'alerta' ? '#fb923c'
              : 'var(--n-text-mid)'

            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--n-border)', backgroundColor: bgRow }}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {p.enCurso && (
                      <span className="h-1.5 w-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: 'var(--n-yellow)' }} />
                    )}
                    <span className={`rounded px-2 py-0.5 font-bold ${cfg?.color ?? 'bg-gray-700/60 text-gray-300'}`}>
                      {cfg?.label ?? p.estado}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--n-text-lt)' }}>
                  {fmt(p.inicio)}
                </td>
                <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--n-text-lt)' }}>
                  {p.fin ? fmt(p.fin) : <span style={{ color: 'var(--n-yellow)' }}>En curso</span>}
                </td>
                <td className="px-4 py-2.5 font-bold font-mono" style={{ color: durColor }}>
                  {formatMin(p.minutosTotal)}
                  {alerta === 'critico' && <span className="ml-1.5 text-xs" style={{ color: 'var(--n-red)' }}>⚠ Excedido</span>}
                  {alerta === 'alerta'  && <span className="ml-1.5 text-xs" style={{ color: '#fb923c' }}>⚠ Demorado</span>}
                  {alerta === 'sin-umbral' && <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--n-text-lt)' }}>— sin umbral</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
