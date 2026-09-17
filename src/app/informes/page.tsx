import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import InformesClient from './InformesClient'

export default async function InformesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell>
      <InformesClient rolUsuario={session.user?.rol ?? ''} faenaId={session.user?.faenaId ?? ''} />
    </AppShell>
  )
}
