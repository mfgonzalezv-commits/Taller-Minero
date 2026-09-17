import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FallasClient from './FallasClient'

export default async function FallasPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell>
      <FallasClient rolUsuario={session.user?.rol ?? ''} />
    </AppShell>
  )
}
