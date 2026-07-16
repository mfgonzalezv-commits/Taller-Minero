import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getPlantillas } from '@/actions/inspeccion'
import InspeccionForm from './InspeccionForm'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default async function NuevaInspeccionPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()
  const [equipos, plantillas] = await Promise.all([
    prisma.equipo.findMany({
      where: { faenaId: faena?.id, activo: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: 'asc' },
    }),
    getPlantillas(),
  ])

  const plantillasSerial = plantillas.map(p => ({
    id: p.id,
    nombre: p.nombre,
    equipoId: p.equipoId,
    items: p.items.map(i => ({
      id: i.id,
      categoria: i.categoria,
      descripcion: i.descripcion,
      criticidadBase: i.criticidadBase,
    })),
  }))

  return (
    <AppShell>
      <div className="flex items-center gap-1.5 mb-5 text-xs font-medium" style={{ color: 'var(--n-text-lt)' }}>
        <Link href="/inspeccion" className="hover:text-white transition-colors">Inspección</Link>
        <ChevronRight size={13} />
        <span className="text-white">Nueva inspección</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-black text-white uppercase tracking-tight">Inspección Pre-Turno</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--n-text-lt)' }}>
          Revisa el estado del equipo antes de iniciar operaciones
        </p>
      </div>

      {plantillasSerial.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <p className="text-sm font-bold text-white mb-2">No hay plantillas de inspección</p>
          <p className="text-sm mb-4" style={{ color: 'var(--n-text-lt)' }}>
            Primero debes crear una plantilla con los ítems a inspeccionar
          </p>
          <Link href="/inspeccion/plantillas" className="n-btn-primary">
            Crear plantilla
          </Link>
        </div>
      ) : (
        <div className="max-w-2xl">
          <InspeccionForm equipos={equipos} plantillas={plantillasSerial} />
        </div>
      )}
    </AppShell>
  )
}
