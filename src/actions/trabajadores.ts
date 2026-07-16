'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { TipoTrabajador } from '@prisma/client'

export async function getTrabajadores() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.trabajador.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
  })
}

export async function crearTrabajador(data: {
  nombre: string
  rut?: string
  cargo?: string
  tipo: TipoTrabajador
  sueldoBruto: number
  horasMensuales: number
  tasaLeyesSociales: number
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.trabajador.create({
    data: {
      faenaId: session.user.faenaId,
      nombre: data.nombre,
      rut: data.rut || null,
      cargo: data.cargo || null,
      tipo: data.tipo,
      sueldoBruto: data.sueldoBruto,
      horasMensuales: data.horasMensuales,
      tasaLeyesSociales: data.tasaLeyesSociales,
    },
  })

  revalidatePath('/trabajadores')
}

export async function actualizarTrabajador(id: string, data: {
  nombre: string
  rut?: string
  cargo?: string
  tipo: TipoTrabajador
  sueldoBruto: number
  horasMensuales: number
  tasaLeyesSociales: number
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.trabajador.update({
    where: { id },
    data: {
      nombre: data.nombre,
      rut: data.rut || null,
      cargo: data.cargo || null,
      tipo: data.tipo,
      sueldoBruto: data.sueldoBruto,
      horasMensuales: data.horasMensuales,
      tasaLeyesSociales: data.tasaLeyesSociales,
    },
  })

  revalidatePath('/trabajadores')
}

export async function eliminarTrabajador(id: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.trabajador.update({ where: { id }, data: { activo: false } })
  revalidatePath('/trabajadores')
}

/**
 * Calcula la tasa de overhead del taller:
 * Σ costo empresa mensual (INDIRECTO) / Σ horas disponibles (DIRECTO)
 * Retorna $/hora de overhead
 */
export async function calcularTasaOverhead(faenaId: string): Promise<number> {
  const trabajadores = await prisma.trabajador.findMany({
    where: { faenaId, activo: true },
    select: { tipo: true, sueldoBruto: true, horasMensuales: true, tasaLeyesSociales: true },
  })

  const costoIndirecto = trabajadores
    .filter(t => t.tipo === 'INDIRECTO')
    .reduce((acc, t) => acc + Number(t.sueldoBruto) * (1 + Number(t.tasaLeyesSociales)), 0)

  const horasDirectas = trabajadores
    .filter(t => t.tipo === 'DIRECTO')
    .reduce((acc, t) => acc + t.horasMensuales, 0)

  if (horasDirectas === 0) return 0
  return costoIndirecto / horasDirectas
}

