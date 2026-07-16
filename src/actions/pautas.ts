'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type EstadoPM = 'VENCIDA' | 'PROXIMA' | 'OT_ACTIVA' | 'OK'

export type EquipoPMStatus = {
  equipoId: string
  codigo: string
  nombre: string
  valorActual: number
  unidad: 'HRS' | 'KM'
  pauta: { id: string; nombre: string; ciclosDisponibles: number[] }
  cicloVencido: number | null
  cicloProximo: number
  restante: number
  estado: EstadoPM
  otActivaId: string | null
  otActivaCiclo: number | null
}

export async function getEstadoPM(): Promise<EquipoPMStatus[]> {
  const session = await auth()
  if (!session?.user?.faenaId) return []

  const UMBRAL = 100

  const equipos = await prisma.equipo.findMany({
    where: { faenaId: session.user.faenaId, activo: true, pautaId: { not: null } },
    include: {
      pauta: { select: { id: true, nombre: true, tipoMetrica: true, ciclosDisponibles: true } },
      ots: {
        where: { tipoMantenimiento: 'PREVENTIVO', estado: { not: 'CERRADA' } },
        select: { id: true, cicloPM: true, pautaId: true },
        orderBy: { fechaCreacion: 'desc' },
        take: 3,
      },
    },
    orderBy: { codigo: 'asc' },
  })

  const result: EquipoPMStatus[] = []

  for (const equipo of equipos) {
    if (!equipo.pauta || equipo.pauta.ciclosDisponibles.length === 0) continue

    const valorActual = equipo.pauta.tipoMetrica === 'HRS'
      ? Number(equipo.horometroActual)
      : Number(equipo.kilometrajeActual)

    const ciclos = equipo.pauta.ciclosDisponibles

    // Ciclos vencidos: valor actual divisible exactamente por el ciclo
    const vencidos = ciclos.filter(c => valorActual > 0 && valorActual % c === 0)
    const cicloVencido = vencidos.length > 0 ? Math.max(...vencidos) : null

    // Próximo ciclo estricto (mayor que valorActual)
    let cicloProximo = Infinity
    for (const c of ciclos) {
      const next = Math.ceil((valorActual + 0.001) / c) * c
      if (next < cicloProximo) cicloProximo = next
    }
    const restante = cicloProximo - valorActual

    // OT preventiva activa para este equipo
    const otActiva = equipo.ots.find(ot => ot.pautaId === equipo.pautaId)

    let estado: EstadoPM
    if (otActiva) {
      estado = 'OT_ACTIVA'
    } else if (cicloVencido !== null) {
      estado = 'VENCIDA'
    } else if (restante <= UMBRAL) {
      estado = 'PROXIMA'
    } else {
      estado = 'OK'
    }

    result.push({
      equipoId: equipo.id,
      codigo: equipo.codigo,
      nombre: equipo.nombre,
      valorActual,
      unidad: equipo.pauta.tipoMetrica as 'HRS' | 'KM',
      pauta: { id: equipo.pauta.id, nombre: equipo.pauta.nombre, ciclosDisponibles: ciclos },
      cicloVencido,
      cicloProximo: cicloProximo === Infinity ? ciclos[ciclos.length - 1] : cicloProximo,
      restante: cicloProximo === Infinity ? 0 : restante,
      estado,
      otActivaId: otActiva?.id ?? null,
      otActivaCiclo: otActiva?.cicloPM ?? null,
    })
  }

  const orden: Record<EstadoPM, number> = { VENCIDA: 0, PROXIMA: 1, OT_ACTIVA: 2, OK: 3 }
  return result.sort((a, b) => orden[a.estado] - orden[b.estado])
}

export async function getPautasDisponibles() {
  const session = await auth()
  if (!session?.user?.faenaId) return []
  return prisma.pautaMantenimiento.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    select: { id: true, nombre: true, tipoMetrica: true, ciclosDisponibles: true, codigosInternos: true },
    orderBy: { nombre: 'asc' },
  })
}

export async function vincularPautaEquipo(equipoId: string, pautaId: string | null) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')
  await prisma.equipo.update({
    where: { id: equipoId },
    data: { pautaId },
  })
  revalidatePath(`/equipos/${equipoId}`)
}

export async function getPautaEquipo(equipoId: string) {
  const equipo = await prisma.equipo.findUnique({
    where: { id: equipoId },
    include: {
      pauta: {
        include: {
          items: { orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] },
        },
      },
    },
  })
  return equipo?.pauta ?? null
}

export async function crearChecklistDesdePauta(otId: string, pautaId: string, ciclo: number) {
  const pauta = await prisma.pautaMantenimiento.findUnique({
    where: { id: pautaId },
    include: { items: { orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] } },
  })
  if (!pauta) throw new Error('Pauta no encontrada')

  // Solo incluir ítems que aplican en este ciclo
  const itemsAplicables = pauta.items.filter(item =>
    item.ciclosReemplazar.includes(ciclo) || item.ciclosCondicionar.includes(ciclo)
  )

  if (itemsAplicables.length === 0) {
    // Si no hay ítems para este ciclo exacto, incluir todos
    const todos = pauta.items
    await prisma.checklistItemOT.createMany({
      data: todos.map((item, idx) => ({
        otId,
        descripcion: item.componente,
        codigo: item.alternativo || null,
        cantidad: item.cantidad,
        unidad: item.unidad || 'un',
        obligatorio: true,
        completado: false,
        orden: idx,
      })),
    })
    return todos.length
  }

  await prisma.checklistItemOT.createMany({
    data: itemsAplicables.map((item, idx) => ({
      otId,
      descripcion: `${item.ciclosReemplazar.includes(ciclo) ? '🔄 ' : '🔍 '}${item.componente}`,
      codigo: item.alternativo || null,
      cantidad: item.cantidad,
      unidad: item.unidad || 'un',
      obligatorio: item.ciclosReemplazar.includes(ciclo),
      completado: false,
      orden: idx,
    })),
  })

  return itemsAplicables.length
}

export async function programarPM(data: {
  equipoId: string
  pautaId: string
  ciclo: number
  fechaPlanificada: string
  observacion?: string
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const equipo = await prisma.equipo.findUnique({
    where: { id: data.equipoId },
    select: { costoHoraDetencion: true, codigo: true },
  })

  const unidad = await prisma.pautaMantenimiento.findUnique({
    where: { id: data.pautaId },
    select: { tipoMetrica: true },
  })

  const ot = await prisma.ordenTrabajo.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId,
      pautaId: data.pautaId,
      cicloPM: data.ciclo,
      tipoMantenimiento: 'PREVENTIVO',
      estado: 'PROGRAMADA',
      origenFalla: 'MANTENIMIENTO_PREVENTIVO',
      descripcionFalla: `PM ${data.ciclo.toLocaleString()} ${unidad?.tipoMetrica === 'HRS' ? 'hrs' : 'km'} programada${data.observacion ? ` — ${data.observacion}` : ''}`,
      prioridad: 'MEDIA',
      fechaCompromiso: new Date(data.fechaPlanificada),
      creadoPorId: session.user.id,
      costoHoraSnapshot: equipo?.costoHoraDetencion ?? 0,
      historial: {
        create: {
          estadoNuevo: 'PROGRAMADA',
          faenaId: session.user.faenaId,
          usuarioId: session.user.id,
          observacion: `PM programada para el ${new Date(data.fechaPlanificada).toLocaleDateString('es-CL')}`,
        },
      },
    },
  })

  await crearChecklistDesdePauta(ot.id, data.pautaId, data.ciclo)

  revalidatePath('/mantenimiento')
  revalidatePath('/ot')
  return ot.id
}

export async function marcarChecklistItem(
  itemId: string,
  resultado: 'OK' | 'NA' | 'OBSERVACION',
  observacion?: string
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Sin sesión')

  await prisma.checklistItemOT.update({
    where: { id: itemId },
    data: {
      completado: resultado !== 'OBSERVACION',
      resultado,
      observacion: observacion || null,
      completadoAt: new Date(),
      completadoPor: session.user.id,
    },
  })
}
