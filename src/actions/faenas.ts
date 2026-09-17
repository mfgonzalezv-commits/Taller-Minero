'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, auditar } from '@/lib/authz'

export type FaenaConEquipos = {
  id: string
  nombre: string
  codigo: string
  ubicacion: string | null
  activa: boolean
  equipos: { id: string; codigo: string; nombre: string; tipo: string; activo: boolean }[]
}

export async function getFaenas(): Promise<FaenaConEquipos[]> {
  await requireSesion()

  const faenas = await prisma.faena.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      equipos: {
        where: { activo: true },
        select: { id: true, codigo: true, nombre: true, tipo: true, activo: true },
        orderBy: { codigo: 'asc' },
      },
    },
  })
  return faenas
}

export async function crearFaena(data: { nombre: string; codigo: string; ubicacion?: string }) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR'])

  const faena = await prisma.faena.create({
    data: {
      nombre: data.nombre,
      codigo: data.codigo.toUpperCase(),
      ubicacion: data.ubicacion || null,
    },
  })

  await auditar({
    entidad: 'Faena',
    entidadId: faena.id,
    accion: 'CREAR',
    usuarioId: sesion.userId,
    valorNuevo: data,
  })

  revalidatePath('/faenas')
}

export async function trasladarEquipo(equipoId: string, faenaId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR'])

  const equipo = await prisma.equipo.findUniqueOrThrow({
    where: { id: equipoId },
    select: { faenaId: true },
  })

  await prisma.equipo.update({
    where: { id: equipoId },
    data: { faenaId },
  })

  await auditar({
    entidad: 'Equipo',
    entidadId: equipoId,
    accion: 'TRASLADAR_FAENA',
    usuarioId: sesion.userId,
    valorAnterior: { faenaId: equipo.faenaId },
    valorNuevo: { faenaId },
  })

  revalidatePath('/faenas')
  revalidatePath('/equipos')
}

export async function toggleFaenaActiva(faenaId: string, activa: boolean) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR'])

  await prisma.faena.update({
    where: { id: faenaId },
    data: { activa },
  })

  await auditar({
    faenaId,
    entidad: 'Faena',
    entidadId: faenaId,
    accion: activa ? 'ACTIVAR' : 'DESACTIVAR',
    usuarioId: sesion.userId,
    valorNuevo: { activa },
  })

  revalidatePath('/faenas')
}
