import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NuevoUsuarioForm from './NuevoUsuarioForm'

export default async function NuevoUsuarioPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell>
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Agregar Usuario</h1>
        <NuevoUsuarioForm />
      </div>
    </AppShell>
  )
}
