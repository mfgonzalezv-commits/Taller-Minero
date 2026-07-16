import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import EditarEquipoForm from './EditarEquipoForm'

export default async function EditarEquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.rol !== 'ADMINISTRADOR' && session.user?.rol !== 'JEFE_TALLER') {
    redirect('/equipos')
  }

  const { id } = await params
  const equipo = await prisma.equipo.findUnique({ where: { id } })
  if (!equipo) notFound()

  return (
    <AppShell>
      <div className="flex items-center gap-1.5 mb-5 text-xs font-medium" style={{ color: 'var(--n-text-lt)' }}>
        <Link href="/equipos" className="hover:text-white transition-colors">Equipos</Link>
        <ChevronRight size={13} />
        <Link href={`/equipos/${id}`} className="hover:text-white transition-colors">{equipo.codigo}</Link>
        <ChevronRight size={13} />
        <span className="text-white">Editar</span>
      </div>

      <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-6">Editar equipo</h1>

      <div className="max-w-2xl">
        <EditarEquipoForm equipo={equipo} />
      </div>
    </AppShell>
  )
}
