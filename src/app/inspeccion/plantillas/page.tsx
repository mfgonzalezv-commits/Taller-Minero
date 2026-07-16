import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getPlantillas } from '@/actions/inspeccion'
import PlantillasClient from './PlantillasClient'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default async function PlantillasPage() {
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
    equipo: p.equipo ? { codigo: p.equipo.codigo, nombre: p.equipo.nombre } : null,
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
        <span className="text-white">Plantillas</span>
      </div>
      <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-6">Plantillas de Inspección</h1>
      <PlantillasClient equipos={equipos} plantillas={plantillasSerial} />
    </AppShell>
  )
}
