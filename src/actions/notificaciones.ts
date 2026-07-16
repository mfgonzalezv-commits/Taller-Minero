'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export type Notificacion = {
  id: string
  tipo: 'OT_ESTANCADA' | 'STOCK_BAJO' | 'MANTENCION_VENCIDA' | 'MANTENCION_PROXIMA' | 'PM_VENCIDA' | 'PM_PROXIMA'
  titulo: string
  mensaje: string
  href: string
  urgente: boolean
}

export async function getNotificaciones(): Promise<Notificacion[]> {
  const session = await auth()
  if (!session?.user?.faenaId) return []

  const faenaId = session.user.faenaId
  const notificaciones: Notificacion[] = []
  const ahora = new Date()
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000)

  // OTs estancadas (sin cambio de estado en +24h, no cerradas)
  const otsEstancadas = await prisma.ordenTrabajo.findMany({
    where: {
      faenaId,
      estado: { not: 'CERRADA' },
      updatedAt: { lt: hace24h },
    },
    include: { equipo: { select: { codigo: true } } },
    orderBy: { updatedAt: 'asc' },
    take: 5,
  })

  for (const ot of otsEstancadas) {
    const horasParado = Math.floor((ahora.getTime() - ot.updatedAt.getTime()) / 3600000)
    notificaciones.push({
      id: `ot-${ot.id}`,
      tipo: 'OT_ESTANCADA',
      titulo: `OT #${ot.numeroOt} sin movimiento`,
      mensaje: `${ot.equipo.codigo} lleva ${horasParado}h sin cambio de estado`,
      href: `/ot/${ot.id}`,
      urgente: ot.updatedAt < hace48h || ot.prioridad === 'CRITICA',
    })
  }

  // Stock bajo mínimo
  const itemsBajos = await prisma.itemBodega.findMany({
    where: {
      faenaId,
      activo: true,
    },
  })

  for (const item of itemsBajos) {
    if (Number(item.stockActual) <= Number(item.stockMinimo)) {
      notificaciones.push({
        id: `bodega-${item.id}`,
        tipo: 'STOCK_BAJO',
        titulo: 'Stock bajo mínimo',
        mensaje: `${item.descripcion}: ${Number(item.stockActual)} ${item.unidad} (mín. ${Number(item.stockMinimo)})`,
        href: '/bodega',
        urgente: Number(item.stockActual) === 0,
      })
    }
  }

  // Mantención vencida o próxima
  const planes = await prisma.planMantenimiento.findMany({
    where: { faenaId, activo: true },
    include: {
      equipo: { select: { codigo: true, horometroActual: true, kilometrajeActual: true } },
    },
  })

  for (const p of planes) {
    const horoActual = Number(p.equipo.horometroActual)
    const kmActual = Number(p.equipo.kilometrajeActual)
    const proxHoras = p.proximaEjecucionHoras ? Number(p.proximaEjecucionHoras) : null
    const proxKm = p.proximaEjecucionKm ? Number(p.proximaEjecucionKm) : null

    const faltanHoras = proxHoras !== null ? proxHoras - horoActual : null
    const faltanKm = proxKm !== null ? proxKm - kmActual : null

    const vencido = (faltanHoras !== null && faltanHoras <= 0) || (faltanKm !== null && faltanKm <= 0)
    const proximo = !vencido && ((faltanHoras !== null && faltanHoras <= 50) || (faltanKm !== null && faltanKm <= 500))

    if (vencido) {
      notificaciones.push({
        id: `plan-${p.id}`,
        tipo: 'MANTENCION_VENCIDA',
        titulo: `Mantención vencida`,
        mensaje: `${p.equipo.codigo}: ${p.nombre}`,
        href: '/mantenimiento',
        urgente: true,
      })
    } else if (proximo) {
      notificaciones.push({
        id: `plan-${p.id}`,
        tipo: 'MANTENCION_PROXIMA',
        titulo: `Mantención próxima`,
        mensaje: `${p.equipo.codigo}: ${p.nombre}${faltanHoras !== null ? ` (faltan ${faltanHoras}h)` : ''}`,
        href: '/mantenimiento',
        urgente: false,
      })
    }
  }

  // Alertas de Pauta de Mantenimiento (nuevo sistema PM)
  const UMBRAL_ALERTA = 100 // HRS o KM antes de vencer

  const equiposConPauta = await prisma.equipo.findMany({
    where: { faenaId, activo: true, pautaId: { not: null } },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      horometroActual: true,
      kilometrajeActual: true,
      pauta: { select: { ciclosDisponibles: true, tipoMetrica: true } },
    },
  })

  for (const equipo of equiposConPauta) {
    const pauta = equipo.pauta
    if (!pauta || pauta.ciclosDisponibles.length === 0) continue

    const valorActual = pauta.tipoMetrica === 'HRS'
      ? Number(equipo.horometroActual)
      : Number(equipo.kilometrajeActual)

    if (valorActual <= 0) continue

    const unidad = pauta.tipoMetrica === 'HRS' ? 'hrs' : 'km'

    // Para cada ciclo, calcular cuánto falta para el próximo
    let menorRestante = Infinity
    let cicloProximo = 0

    for (const ciclo of pauta.ciclosDisponibles) {
      const resto = valorActual % ciclo
      // Si resto == 0: estamos exactamente en un punto de ciclo → vencida
      const restante = resto === 0 ? 0 : ciclo - resto
      if (restante < menorRestante) {
        menorRestante = restante
        cicloProximo = resto === 0 ? valorActual : valorActual + restante
      }
    }

    if (menorRestante === 0) {
      notificaciones.push({
        id: `pm-vencida-${equipo.id}`,
        tipo: 'PM_VENCIDA',
        titulo: 'PM vencida',
        mensaje: `${equipo.codigo} alcanzó ${valorActual.toLocaleString()} ${unidad} — generar OT preventiva`,
        href: `/equipos/${equipo.id}`,
        urgente: true,
      })
    } else if (menorRestante <= UMBRAL_ALERTA) {
      notificaciones.push({
        id: `pm-proxima-${equipo.id}`,
        tipo: 'PM_PROXIMA',
        titulo: 'PM próxima',
        mensaje: `${equipo.codigo}: faltan ${menorRestante} ${unidad} para PM ${cicloProximo.toLocaleString()} ${unidad}`,
        href: `/equipos/${equipo.id}`,
        urgente: false,
      })
    }
  }

  return notificaciones.sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0))
}
