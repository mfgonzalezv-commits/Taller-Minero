import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getComprasDirectas } from '@/actions/sr'
import { ROLES_APROBAR_COMPRA_CENTRAL, ROLES_COMPRAR, ROLES_REGULARIZAR_COMPRA } from '@/lib/permisos-roles'
import ComprasDirectasClient from './ComprasDirectasClient'

export default async function ComprasDirectasPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const rol = session.user?.rol as never
  const puedeVer = [...ROLES_COMPRAR, ...ROLES_REGULARIZAR_COMPRA, ...ROLES_APROBAR_COMPRA_CENTRAL, 'PLANIFICADOR_CENTRAL'].includes(rol)
  if (!puedeVer) redirect('/dashboard')
  const filas = await getComprasDirectas()
  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-black text-white uppercase tracking-tight">Compras directas</h1>
      <p className="mb-5 text-xs" style={{ color: 'var(--n-text-lt)' }}>Compras de emergencia. Bajo $250.000 (IVA incluido) se compra y regulariza en la faena; desde $250.000 el Jefe de Taller Central debe aprobar antes de regularizar.</p>
      <ComprasDirectasClient filas={filas} puedeComprar={ROLES_COMPRAR.includes(rol)} puedeRegularizar={ROLES_REGULARIZAR_COMPRA.includes(rol)} puedeAprobar={ROLES_APROBAR_COMPRA_CENTRAL.includes(rol)} />
    </AppShell>
  )
}
