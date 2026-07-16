import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getEstadoPM } from '@/actions/pautas'
import { getPlanes } from '@/actions/mantenimiento'
import PMControlClient from './PMControlClient'
import PlanesClient from './PlanesClient'
import { AlertTriangle, Clock, CheckCircle2, ClipboardList } from 'lucide-react'

export default async function MantenimientoPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const [estadosPM, planes] = await Promise.all([
    getEstadoPM(),
    getPlanes(),
  ])

  const vencidas  = estadosPM.filter(e => e.estado === 'VENCIDA').length
  const proximas  = estadosPM.filter(e => e.estado === 'PROXIMA').length
  const otActivas = estadosPM.filter(e => e.estado === 'OT_ACTIVA').length
  const alDia     = estadosPM.filter(e => e.estado === 'OK').length

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Mantención Preventiva</h1>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {vencidas > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--n-red)' }}>
                <AlertTriangle size={14} /> {vencidas} vencida{vencidas > 1 ? 's' : ''}
              </span>
            )}
            {proximas > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--n-yellow)' }}>
                <Clock size={14} /> {proximas} próxima{proximas > 1 ? 's' : ''}
              </span>
            )}
            {otActivas > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: '#a5b4fc' }}>
                <ClipboardList size={14} /> {otActivas} con OT activa
              </span>
            )}
            {alDia > 0 && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: '#4ade80' }}>
                <CheckCircle2 size={14} /> {alDia} al día
              </span>
            )}
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1.5 rounded" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}>
          {estadosPM.length} equipos con pauta
        </div>
      </div>

      {/* PM Principal — nuevo sistema de pautas */}
      <PMControlClient equipos={estadosPM} />

      {/* Planes legacy — sistema anterior */}
      {planes.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              Planes manuales (sistema anterior)
            </h2>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--n-border)' }} />
          </div>
          <PlanesClient planes={planes} />
        </div>
      )}
    </AppShell>
  )
}
