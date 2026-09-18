import { auth } from '@/lib/auth'
import { TopBar } from './TopBar'
import { getNotificaciones } from '@/actions/notificaciones'

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const notificaciones = await getNotificaciones()

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--n-bg)' }}>
      <TopBar
        userName={session?.user?.nombre ?? session?.user?.email ?? ''}
        userRole={session?.user?.rol ?? ''}
        notificaciones={notificaciones}
      />
      <main className="max-w-screen-xl mx-auto px-4 py-4 sm:px-6 sm:py-6 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
