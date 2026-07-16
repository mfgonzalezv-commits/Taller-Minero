'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export type FaenaConEquipos = {
  id: string
  nombre: string
  codigo: string
  ubicacion: string | null
  activa: boolean
  equipos: { id: string; codigo: string; nombre: string; tipo: string; activo: boolean }[]
}

export async function getFaenas(): Promise<FaenaConEquipos[]> {
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
  await prisma.faena.create({
    data: {
      nombre: data.nombre,
      codigo: data.codigo.toUpperCase(),
      ubicacion: data.ubicacion || null,
    },
  })
  revalidatePath('/faenas')
}

export async function trasladarEquipo(equipoId: string, faenaId: string) {
  await prisma.equipo.update({
    where: { id: equipoId },
    data: { faenaId },
  })
  revalidatePath('/faenas')
  revalidatePath('/equipos')
}

export async function toggleFaenaActiva(faenaId: string, activa: boolean) {
  await prisma.faena.update({
    where: { id: faenaId },
    data: { activa },
  })
  revalidatePath('/faenas')
}
