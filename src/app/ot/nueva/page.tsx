import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import NuevaOTForm from './NuevaOTForm'

export default async function NuevaOTPage({ searchParams }: { searchParams: Promise<{ equipoId?: string; tipo?: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')

  const { equipoId: equipoIdParam, tipo: tipoParam } = await searchParams

  const faena = await prisma.faena.findFirst()
  const equipos = await prisma.equipo.findMany({
    where: { faenaId: faena?.id, activo: true },
    select: {
      id: true, codigo: true, nombre: true, tipo: true,
      pauta: { select: { id: true, nombre: true, tipoMetrica: true, ciclosDisponibles: true } },
    },
    orderBy: { codigo: 'asc' },
  })

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Nueva Orden de Trabajo</h1>
        <NuevaOTForm
          equipos={equipos}
          equipoIdInicial={equipoIdParam}
          tipoInicial={tipoParam === 'PREVENTIVO' ? 'PREVENTIVO' : undefined}
        />
      </div>
    </AppShell>
  )
}
