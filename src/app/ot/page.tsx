import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
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
      <PageHeader
        title="Órdenes de Trabajo"
        indicadores={[
          { label: 'activas', value: activas },
          { label: 'críticas', value: criticas, color: criticas > 0 ? 'var(--n-red)' : undefined },
          { label: 'cerradas', value: ots.filter(o => o.estado === 'CERRADA').length },
        ]}
        actions={
          <Link
            href="/ot/nueva"
            className="n-btn-primary"
          >
            <Plus size={15} />
            Nueva OT
          </Link>
        }
      />

      <OTListaClient ots={ots} />
    </AppShell>
  )
}
