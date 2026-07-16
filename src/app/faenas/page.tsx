import { getFaenas } from '@/actions/faenas'
import FaenasClient from './FaenasClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Faenas' }

export default async function FaenasPage() {
  const faenas = await getFaenas()
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--win-text)' }}>Faenas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--win-text-lt)' }}>
            Lugares de operación · {faenas.reduce((a, f) => a + f.equipos.length, 0)} equipos asignados
          </p>
        </div>
      </div>
      <FaenasClient faenas={faenas} />
    </div>
  )
}
