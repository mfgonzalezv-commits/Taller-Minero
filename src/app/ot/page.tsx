import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import OTListaClient from './OTListaClient'

export default async function OTPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()
  const ots = await prisma.ordenTrabajo.findMany({
    where: { faenaId: faena?.id },
    include: {
      equipo: { select: { codigo: true, nombre: true } },
      responsable: { select: { nombre: true } },
    },
    orderBy: [{ prioridad: 'asc' }, { fechaCreacion: 'desc' }],
  })

  const activas = ots.filter(o => o.estado !== 'CERRADA').length
  const criticas = ots.filter(o => o.prioridad === 'CRITICA' && o.estado !== 'CERRADA').length

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Órdenes de Trabajo</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>
            {activas} activas · {criticas > 0 ? <span style={{ color: 'var(--n-red)' }}>{criticas} críticas</span> : '0 críticas'} · {ots.filter(o => o.estado === 'CERRADA').length} cerradas
          </p>
        </div>
        <Link
          href="/ot/nueva"
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--n-red)' }}
        >
          <Plus size={15} />
          Nueva OT
        </Link>
      </div>

      <OTListaClient ots={ots} />
    </AppShell>
  )
}
