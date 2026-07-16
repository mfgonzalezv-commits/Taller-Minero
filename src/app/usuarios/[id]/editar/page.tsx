import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { getUsuarioById } from '@/actions/usuarios'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import EditarUsuarioForm from './EditarUsuarioForm'

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.rol !== 'ADMINISTRADOR' && session.user?.rol !== 'JEFE_TALLER') {
    redirect('/usuarios')
  }

  const { id } = await params
  const usuario = await getUsuarioById(id)
  if (!usuario) notFound()

  return (
    <AppShell>
      <div className="flex items-center gap-1.5 mb-5 text-xs font-medium" style={{ color: 'var(--n-text-lt)' }}>
        <Link href="/usuarios" className="hover:text-white transition-colors">Usuarios</Link>
        <ChevronRight size={13} />
        <span className="text-white">Editar</span>
      </div>

      <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-6">Editar usuario</h1>

      <div className="max-w-xl">
        <EditarUsuarioForm usuario={usuario} />
      </div>
    </AppShell>
  )
}
