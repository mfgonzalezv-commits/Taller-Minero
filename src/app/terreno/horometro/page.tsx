import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import HorometroForm from './HorometroForm'
import PendientesHorometro from './PendientesHorometro'

const ROLES_CONFIRMAN = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR']

export default async function HorometroPage() {
  const session = await auth()
  const puedeConfirmar = ROLES_CONFIRMAN.includes(session?.user?.rol ?? '')
  return (
    <AppShell>
      <HorometroForm />
      {puedeConfirmar && <PendientesHorometro />}
    </AppShell>
  )
}
