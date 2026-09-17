'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireAlcanceFaena } from '@/lib/authz'

export async function registrarHorometro(data: {
  equipoId: string
  horometro?: number
  kilometraje?: number
}) {
  const sesion = await requireSesion()

  if (!data.horometro && !data.kilometraje) {
    throw new Error('Debe ingresar horómetro o kilometraje')
  }

  const equipo = await prisma.equipo.findUniqueOrThrow({
    where: { id: data.equipoId },
    select: { faenaId: true },
  })
  requireAlcanceFaena(sesion, equipo.faenaId)

  const faenaId = equipo.faenaId
  const usuarioId = sesion.userId

  const registro = await prisma.$transaction(async (tx) => {
    const r = await tx.horometroKm.create({
      data: {
        equipoId: data.equipoId,
        faenaId,
        horometro: data.horometro,
        kilometraje: data.kilometraje,
        usuarioId,
        origen: 'manual',
      },
    })

    await tx.equipo.update({
      where: { id: data.equipoId },
      data: {
        ...(data.horometro != null && { horometroActual: data.horometro }),
        ...(data.kilometraje != null && { kilometrajeActual: data.kilometraje }),
      },
    })

    return r
  })

  revalidatePath('/terreno/horometro')
  revalidatePath('/equipos')
  return registro
}

export async function getEquiposParaHorometro() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.equipo.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      tipo: true,
      horometroActual: true,
      kilometrajeActual: true,
      estado: true,
    },
    orderBy: { codigo: 'asc' },
  })
}

export async function getUltimosHorometros(equipoId: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.horometroKm.findMany({
    where: { equipoId, faenaId: session.user.faenaId },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { fechaRegistro: 'desc' },
    take: 10,
  })
}
