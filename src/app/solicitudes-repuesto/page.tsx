import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import GestorSR from './GestorSR'
import type { EstadoSR } from '@prisma/client'

const ESTADO_LABEL: Record<EstadoSR, string> = {
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  EN_BODEGA_CENTRAL: 'En Bodega Central',
  EN_ADQUISICIONES: 'En Adquisiciones',
  ESPERANDO_LLEGADA: 'Esperando llegada',
  RECIBIDA_FAENA: 'Recibida en faena',
  ENTREGADA: 'Entregada',
  RECHAZADA: 'Rechazada',
}

export default async function SolicitudesRepuestoPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()

  const srs = await prisma.solicitudRepuesto.findMany({
    where: { faenaId: faena?.id },
    include: {
      ot: { select: { numeroOt: true, id: true, equipo: { select: { codigo: true, nombre: true } } } },
      items: { include: { itemBodega: { select: { codigo: true, stockActual: true } } } },
      creadoPor: { select: { nombre: true } },
      gestionadoPor: { select: { nombre: true } },
      historial: { include: { usuario: { select: { nombre: true } } }, orderBy: { fechaCambio: 'asc' } },
    },
    orderBy: [{ urgente: 'desc' }, { createdAt: 'asc' }],
  })

  const srsSerial = srs.map(sr => ({
    id: sr.id,
    numeroSr: sr.numeroSr,
    estado: sr.estado,
    urgente: sr.urgente,
    observacion: sr.observacion,
    fechaEstimadaLlegada: sr.fechaEstimadaLlegada?.toISOString() ?? null,
    creadoPor: sr.creadoPor,
    gestionadoPor: sr.gestionadoPor,
    createdAt: sr.createdAt.toISOString(),
    ot: { numeroOt: sr.ot.numeroOt, id: sr.ot.id, equipo: sr.ot.equipo },
    items: sr.items.map(i => ({
      id: i.id,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      unidad: i.unidad,
      itemBodegaId: i.itemBodegaId,
      precioEstimado: i.precioEstimado ? Number(i.precioEstimado) : null,
      cantidadEntregada: Number(i.cantidadEntregada),
      itemBodega: i.itemBodega ? { codigo: i.itemBodega.codigo, stockActual: Number(i.itemBodega.stockActual) } : null,
    })),
    historial: sr.historial.map(h => ({
      id: h.id,
      estadoAnterior: h.estadoAnterior,
      estadoNuevo: h.estadoNuevo,
      observacion: h.observacion,
      usuario: h.usuario,
      fechaCambio: h.fechaCambio.toISOString(),
    })),
  }))

  const pendientes = srsSerial.filter(s => !['ENTREGADA', 'RECHAZADA'].includes(s.estado))
  const cerradas = srsSerial.filter(s => ['ENTREGADA', 'RECHAZADA'].includes(s.estado))

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Solicitudes de Repuesto</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--n-text-lt)' }}>
          {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {cerradas.length} cerrada{cerradas.length !== 1 ? 's' : ''}
        </p>
      </div>

      <GestorSR srs={srsSerial} />
    </AppShell>
  )
}
