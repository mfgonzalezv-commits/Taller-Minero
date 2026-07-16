import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAlertas, getInspecciones } from '@/actions/inspeccion'
import AlertasClient from './AlertasClient'
import Link from 'next/link'
import { Plus, ClipboardCheck, Settings } from 'lucide-react'

export default async function InspeccionPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const [alertas, inspecciones] = await Promise.all([
    getAlertas(true),
    getInspecciones(20),
  ])

  const alertasSerial = alertas.map(a => ({
    id: a.id,
    descripcion: a.descripcion,
    criticidad: a.criticidad as 'INFORMATIVO' | 'OBSERVACION' | 'ALERTA' | 'CRITICO',
    estado: a.estado as 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTA' | 'DESCARTADA',
    otId: a.otId,
    createdAt: a.createdAt.toISOString(),
    equipo: a.equipo,
    inspeccion: {
      fecha: a.inspeccion.fecha.toISOString(),
      turno: a.inspeccion.turno,
      operador: a.inspeccion.operador,
    },
  }))

  const pendientes = alertas.filter(a => a.estado === 'PENDIENTE').length
  const criticos = alertas.filter(a => a.criticidad === 'CRITICO' && a.estado === 'PENDIENTE').length

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Inspección Diaria</h1>
          <div className="flex items-center gap-3 mt-1">
            {criticos > 0 && (
              <p className="text-sm font-bold" style={{ color: 'var(--n-red)' }}>
                🔴 {criticos} crítico{criticos > 1 ? 's' : ''} pendiente{criticos > 1 ? 's' : ''}
              </p>
            )}
            {pendientes > 0 && (
              <p className="text-sm font-bold" style={{ color: 'var(--n-yellow)' }}>
                {pendientes} alerta{pendientes > 1 ? 's' : ''} activa{pendientes > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inspeccion/plantillas"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}>
            <Settings size={12} /> Plantillas
          </Link>
          <Link href="/inspeccion/nueva"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--n-yellow)', color: '#1A1A1A' }}>
            <Plus size={13} /> Nueva inspección
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alertas activas */}
        <div className="lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>
            Alertas activas
          </p>
          <AlertasClient alertas={alertasSerial} />
        </div>

        {/* Inspecciones recientes */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>
            Inspecciones recientes
          </p>
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            {inspecciones.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <ClipboardCheck size={28} className="mx-auto mb-2" style={{ color: 'var(--n-text-lt)' }} />
                <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Sin inspecciones aún</p>
                <Link href="/inspeccion/nueva" className="text-xs font-bold mt-2 block" style={{ color: 'var(--n-yellow)' }}>
                  Hacer la primera →
                </Link>
              </div>
            ) : (
              inspecciones.map(insp => {
                const tieneProblemas = insp.resultados.some(r => r.resultado !== 'OK')
                const criticos = insp.alertas.filter(a => a.criticidad === 'CRITICO').length
                return (
                  <div key={insp.id} className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${criticos > 0 ? 'bg-red-500' : tieneProblemas ? 'bg-yellow-400' : 'bg-green-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{insp.equipo.codigo}</p>
                      <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                        {new Date(insp.fecha).toLocaleDateString('es-CL')} · {insp.operador.nombre}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {insp.alertas.length > 0 ? (
                        <p className="text-xs font-bold" style={{ color: criticos > 0 ? 'var(--n-red)' : 'var(--n-yellow)' }}>
                          {insp.alertas.length} alerta{insp.alertas.length > 1 ? 's' : ''}
                        </p>
                      ) : (
                        <p className="text-xs font-bold" style={{ color: '#4ade80' }}>OK</p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
