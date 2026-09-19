import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NuevoUsuarioForm from './NuevoUsuarioForm'
import { rolesAdministrables } from '@/lib/permisos-roles'
import type { Rol } from '@/lib/roles'

export default async function NuevoUsuarioPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const rolesPermitidos = rolesAdministrables(session.user?.rol as Rol)
  if (rolesPermitidos.length === 0) redirect('/usuarios')

  return (
    <AppShell>
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-black text-white uppercase tracking-tight">Agregar Usuario</h1>
        <NuevoUsuarioForm rolesPermitidos={rolesPermitidos as never} />
      </div>
    </AppShell>
  )
}
