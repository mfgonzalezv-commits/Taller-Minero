import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ArriendosClient from './ArriendosClient'

export default async function ArriendosPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <AppShell>
      <ArriendosClient rolUsuario={session.user?.rol ?? ''} faenaId={session.user?.faenaId ?? ''} />
    </AppShell>
  )
}
