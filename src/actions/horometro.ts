'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function registrarHorometro(data: {
  equipoId: string
  horometro?: number
  kilometraje?: number
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  if (!data.horometro && !data.kilometraje) {
    throw new Error('Debe ingresar horómetro o kilometraje')
  }

  const faenaId = session.user!.faenaId!
  const usuarioId = session.user!.id!

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
