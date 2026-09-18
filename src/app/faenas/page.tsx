import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { getFaenas } from '@/actions/faenas'
import FaenasClient from './FaenasClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Faenas' }

export default async function FaenasPage() {
  const faenas = await getFaenas()
  return (
    <AppShell>
      <PageHeader
        title="Faenas"
        subtitle={`Lugares de operación · ${faenas.reduce((a, f) => a + f.equipos.length, 0)} equipos asignados`}
      />
      <FaenasClient faenas={faenas} />
    </AppShell>
  )
}
