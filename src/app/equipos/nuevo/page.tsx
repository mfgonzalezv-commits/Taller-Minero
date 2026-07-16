import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NuevoEquipoForm from './NuevoEquipoForm'

export default async function NuevoEquipoPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Agregar Equipo</h1>
        <NuevoEquipoForm />
      </div>
    </AppShell>
  )
}
