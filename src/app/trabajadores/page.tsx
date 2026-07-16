import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import TrabajadoresClient from './TrabajadoresClient'

export default async function TrabajadoresPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()
  const trabajadores = await prisma.trabajador.findMany({
    where: { faenaId: faena?.id, activo: true },
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
  })

  // Calcular tasa overhead actual
  const directos = trabajadores.filter(t => t.tipo === 'DIRECTO')
  const indirectos = trabajadores.filter(t => t.tipo === 'INDIRECTO')

  const costoIndirecto = indirectos.reduce(
    (acc, t) => acc + Number(t.sueldoBruto) * (1 + Number(t.tasaLeyesSociales)), 0
  )
  const horasDirectas = directos.reduce((acc, t) => acc + t.horasMensuales, 0)
  const tasaOverhead = horasDirectas > 0 ? costoIndirecto / horasDirectas : 0

  return (
    <AppShell>
      <TrabajadoresClient
        trabajadores={trabajadores.map(t => ({
          id: t.id,
          nombre: t.nombre,
          rut: t.rut,
          cargo: t.cargo,
          tipo: t.tipo,
          sueldoBruto: Number(t.sueldoBruto),
          horasMensuales: t.horasMensuales,
          tasaLeyesSociales: Number(t.tasaLeyesSociales),
        }))}
        tasaOverhead={tasaOverhead}
      />
    </AppShell>
  )
}
