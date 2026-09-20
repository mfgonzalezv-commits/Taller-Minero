import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAlertasInternas } from '@/actions/alertas'
import ListaNotificaciones from './ListaNotificaciones'

export default async function NotificacionesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const items = await getAlertasInternas()
  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-black text-white uppercase tracking-tight">Alertas y escalamientos</h1>
      <ListaNotificaciones items={items.map(n => ({ id: n.id, titulo: n.titulo, mensaje: n.mensaje, nivel: n.nivel, leida: !!n.leidaAt, fecha: new Date(n.createdAt).toISOString() }))} />
    </AppShell>
  )
}
