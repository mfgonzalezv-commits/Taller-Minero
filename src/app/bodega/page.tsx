import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import BodegaClient from './BodegaClient'
import NuevoItemForm from './NuevoItemForm'
import SolicitudesPendientes from './SolicitudesPendientes'

export default async function BodegaPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()

  const [items, solicitudes] = await Promise.all([
    prisma.itemBodega.findMany({
      where: { faenaId: faena?.id, activo: true },
      orderBy: { descripcion: 'asc' },
    }),
    prisma.repuestoOT.findMany({
      where: { faenaId: faena?.id, estadoSolicitud: { in: ['AUTORIZADO', 'EN_COMPRAS'] } },
      include: {
        ot: { select: { id: true, numeroOt: true, equipo: { select: { codigo: true, nombre: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const bajoStock = items.filter(i => Number(i.stockActual) <= Number(i.stockMinimo)).length
  const pendientesBodega = solicitudes.filter(s => s.estadoSolicitud === 'AUTORIZADO').length
  const enCompras = solicitudes.filter(s => s.estadoSolicitud === 'EN_COMPRAS').length

  const solicitudesSerial = solicitudes.map(s => ({
    id: s.id,
    otId: s.otId,
    descripcion: s.descripcion,
    cantidad: Number(s.cantidad),
    unidad: s.unidad,
    createdAt: s.createdAt.toISOString(),
    estadoSolicitud: s.estadoSolicitud as 'AUTORIZADO' | 'EN_COMPRAS',
    ot: { id: s.ot.id, numeroOt: s.ot.numeroOt, equipo: s.ot.equipo },
  }))

  const itemsSerial = items.map(i => ({
    id: i.id,
    codigo: i.codigo,
    descripcion: i.descripcion,
    unidad: i.unidad,
    stockActual: Number(i.stockActual),
    stockMinimo: Number(i.stockMinimo),
    precioRef: Number(i.precioRef),
    categoria: i.categoria,
  }))

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Bodega</h1>
          {bajoStock > 0 && (
            <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--n-red)' }}>
              ⚠ {bajoStock} ítem{bajoStock > 1 ? 's' : ''} bajo stock mínimo
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {pendientesBodega > 0 && (
            <span className="rounded-lg px-3 py-1.5 text-xs font-bold bg-blue-900/60 text-blue-300">
              {pendientesBodega} por entregar
            </span>
          )}
          {enCompras > 0 && (
            <span className="rounded-lg px-3 py-1.5 text-xs font-bold bg-purple-900/60 text-purple-300">
              {enCompras} en compras
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {solicitudes.length > 0 && (
          <SolicitudesPendientes solicitudes={solicitudesSerial} items={itemsSerial} />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BodegaClient items={items} />
          </div>
          <div>
            <NuevoItemForm />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
