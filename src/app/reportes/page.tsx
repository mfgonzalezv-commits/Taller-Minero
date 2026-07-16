import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ReportesClient from './ReportesClient'

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; equipoId?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const { desde, hasta, equipoId } = await searchParams

  const faena = await prisma.faena.findFirst()
  const faenaId = faena?.id

  const fechaDesde = desde ? new Date(desde) : new Date(new Date().setMonth(new Date().getMonth() - 1))
  const fechaHasta = hasta ? new Date(hasta + 'T23:59:59') : new Date()

  const equipos = await prisma.equipo.findMany({
    where: { faenaId, activo: true },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { codigo: 'asc' },
  })

  const ots = await prisma.ordenTrabajo.findMany({
    where: {
      faenaId,
      ...(equipoId && { equipoId }),
      fechaCreacion: { gte: fechaDesde, lte: fechaHasta },
    },
    include: {
      equipo: { select: { id: true, codigo: true, nombre: true, tipo: true } },
      repuestos: { select: { total: true } },
    },
    orderBy: { fechaCreacion: 'desc' },
  })

  // Agrupar por equipo
  const porEquipo = new Map<string, {
    equipoId: string
    codigo: string
    nombre: string
    tipo: string
    otsTotal: number
    otsCerradas: number
    minDetencion: number
    costoDetencion: number
    costoRepuestos: number
  }>()

  for (const ot of ots) {
    const key = ot.equipo.id
    if (!porEquipo.has(key)) {
      porEquipo.set(key, {
        equipoId: key,
        codigo: ot.equipo.codigo,
        nombre: ot.equipo.nombre,
        tipo: ot.equipo.tipo,
        otsTotal: 0,
        otsCerradas: 0,
        minDetencion: 0,
        costoDetencion: 0,
        costoRepuestos: 0,
      })
    }
    const row = porEquipo.get(key)!
    row.otsTotal++
    if (ot.estado === 'CERRADA') row.otsCerradas++
    row.minDetencion += ot.tiempoDetenidoMin
    row.costoDetencion += Number(ot.costoDetencion)
    row.costoRepuestos += ot.repuestos.reduce((a, r) => a + Number(r.total), 0)
  }

  const resumen = Array.from(porEquipo.values()).sort(
    (a, b) => (b.costoDetencion + b.costoRepuestos) - (a.costoDetencion + a.costoRepuestos)
  )

  const totales = resumen.reduce(
    (acc, r) => ({
      otsTotal: acc.otsTotal + r.otsTotal,
      minDetencion: acc.minDetencion + r.minDetencion,
      costoDetencion: acc.costoDetencion + r.costoDetencion,
      costoRepuestos: acc.costoRepuestos + r.costoRepuestos,
    }),
    { otsTotal: 0, minDetencion: 0, costoDetencion: 0, costoRepuestos: 0 }
  )

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Reportes de Costo</h1>

        <ReportesClient
          equipos={equipos}
          resumen={resumen}
          totales={totales}
          filtros={{
            desde: fechaDesde.toISOString().split('T')[0],
            hasta: fechaHasta.toISOString().split('T')[0],
            equipoId: equipoId ?? '',
          }}
        />
      </div>
    </AppShell>
  )
}
