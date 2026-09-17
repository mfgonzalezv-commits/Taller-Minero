'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { TipoEquipo, EstadoEquipo } from '@prisma/client'
import { requireSesion, requireAlcanceFaena, auditar } from '@/lib/authz'

export async function getEquipos() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.equipo.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    include: {
      ots: {
        where: { estado: { not: 'CERRADA' } },
        select: { id: true, estado: true, prioridad: true },
      },
    },
    orderBy: { codigo: 'asc' },
  })
}

export async function getEquipoById(id: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.equipo.findFirst({
    where: { id, faenaId: session.user.faenaId },
    include: {
      ots: {
        orderBy: { fechaCreacion: 'desc' },
        take: 10,
      },
      horometros: {
        orderBy: { fechaRegistro: 'desc' },
        take: 20,
      },
    },
  })
}

export async function crearEquipo(data: {
  codigo: string
  nombre: string
  tipo: TipoEquipo
  marca?: string
  modelo?: string
  anio?: number
  ubicacionActual?: string
  costoHoraDetencion?: number
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const equipo = await prisma.equipo.create({
    data: {
      ...data,
      faenaId: session.user.faenaId,
      costoHoraDetencion: data.costoHoraDetencion ?? 0,
    },
  })

  revalidatePath('/equipos')
  return equipo
}

export async function actualizarEquipo(id: string, data: {
  nombre: string
  tipo: TipoEquipo
  marca?: string
  modelo?: string
  anio?: number
  ubicacionActual?: string
  costoHoraDetencion?: number
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')
  if (session.user.rol !== 'ADMINISTRADOR' && session.user.rol !== 'JEFE_TALLER') {
    throw new Error('Sin permisos')
  }

  const equipo = await prisma.equipo.update({
    where: { id },
    data: {
      nombre: data.nombre,
      tipo: data.tipo,
      marca: data.marca || null,
      modelo: data.modelo || null,
      anio: data.anio || null,
      ubicacionActual: data.ubicacionActual || null,
      costoHoraDetencion: data.costoHoraDetencion ?? 0,
    },
  })

  revalidatePath('/equipos')
  revalidatePath(`/equipos/${id}`)
  return equipo
}

export async function eliminarEquipo(id: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')
  if (session.user.rol !== 'ADMINISTRADOR' && session.user.rol !== 'JEFE_TALLER') {
    throw new Error('Sin permisos')
  }

  await prisma.equipo.update({ where: { id }, data: { activo: false } })
  revalidatePath('/equipos')
}

export async function actualizarEstadoEquipo(id: string, estado: EstadoEquipo) {
  const sesion = await requireSesion()

  const actual = await prisma.equipo.findUniqueOrThrow({
    where: { id },
    select: { faenaId: true, estado: true },
  })
  requireAlcanceFaena(sesion, actual.faenaId)

  const equipo = await prisma.equipo.update({
    where: { id },
    data: { estado },
  })

  await auditar({
    faenaId: actual.faenaId,
    entidad: 'Equipo',
    entidadId: id,
    accion: 'CAMBIAR_ESTADO',
    usuarioId: sesion.userId,
    valorAnterior: { estado: actual.estado },
    valorNuevo: { estado },
  })

  revalidatePath('/equipos')
  revalidatePath(`/equipos/${id}`)
  return equipo
}
