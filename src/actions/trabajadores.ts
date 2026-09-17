'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { TipoTrabajador } from '@prisma/client'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'

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
    where: { id, faenaId: session.user.faenaId },
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

  await prisma.trabajador.update({ where: { id, faenaId: session.user.faenaId }, data: { activo: false } })
  revalidatePath('/trabajadores')
}

// Traslada un trabajador a otra faena dejando historial trazable
// (transferencia temporal). Solo roles con alcance central.
export async function trasladarTrabajador(trabajadorId: string, faenaDestinoId: string, motivo?: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])

  const trabajador = await prisma.trabajador.findUniqueOrThrow({
    where: { id: trabajadorId },
    select: { faenaId: true },
  })

  await prisma.$transaction([
    prisma.trasladoTrabajador.create({
      data: {
        trabajadorId,
        faenaOrigenId: trabajador.faenaId,
        faenaDestinoId,
        motivo: motivo ?? null,
        usuarioId: sesion.userId,
      },
    }),
    prisma.trabajador.update({
      where: { id: trabajadorId },
      data: { faenaId: faenaDestinoId },
    }),
  ])

  await auditar({
    entidad: 'Trabajador',
    entidadId: trabajadorId,
    accion: 'TRASLADAR_FAENA',
    usuarioId: sesion.userId,
    valorAnterior: { faenaId: trabajador.faenaId },
    valorNuevo: { faenaId: faenaDestinoId },
    motivo: motivo ?? null,
  })

  revalidatePath('/trabajadores')
}

export async function getHistorialTraslados(trabajadorId: string) {
  await requireSesion()
  return prisma.trasladoTrabajador.findMany({
    where: { trabajadorId },
    include: {
      faenaOrigen: { select: { nombre: true } },
      faenaDestino: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
    },
    orderBy: { fechaInicio: 'desc' },
  })
}

/**
 * Calcula la tasa de overhead del taller:
 * Σ costo empresa mensual (INDIRECTO) / Σ horas disponibles (DIRECTO)
 * Retorna $/hora de overhead
 */
export async function calcularTasaOverhead(faenaId: string): Promise<number> {
  const sesion = await requireSesion()
  requireAlcanceFaena(sesion, faenaId)

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

