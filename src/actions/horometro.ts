'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'

const SALTO_MAX_POR_HORA = 3 // horómetro: ningún equipo debería sumar más de ~3 hrs de uso por hora real transcurrida

function calcularAdvertencia(params: {
  valorNuevo: number
  valorAnterior: number | null
  fechaAnterior: Date | null
  unidad: 'horómetro' | 'kilometraje'
}): string | null {
  const { valorNuevo, valorAnterior, fechaAnterior, unidad } = params
  if (valorAnterior === null) return null

  if (valorNuevo < valorAnterior) {
    return `Lectura de ${unidad} menor a la anterior (${valorAnterior} → ${valorNuevo})`
  }

  if (fechaAnterior) {
    const horasTranscurridas = Math.max(0.1, (Date.now() - fechaAnterior.getTime()) / 3_600_000)
    const maxPlausible = valorAnterior + horasTranscurridas * SALTO_MAX_POR_HORA
    if (valorNuevo > maxPlausible) {
      return `Salto anormal de ${unidad}: +${(valorNuevo - valorAnterior).toFixed(1)} en ${horasTranscurridas.toFixed(1)}h`
    }
  }

  return null
}

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
    select: { faenaId: true, horometroActual: true, kilometrajeActual: true },
  })
  requireAlcanceFaena(sesion, equipo.faenaId)

  const ultima = await prisma.horometroKm.findFirst({
    where: { equipoId: data.equipoId },
    orderBy: { fechaRegistro: 'desc' },
    select: { fechaRegistro: true },
  })

  const advertencias: string[] = []
  if (data.horometro != null) {
    const a = calcularAdvertencia({
      valorNuevo: data.horometro,
      valorAnterior: Number(equipo.horometroActual) || null,
      fechaAnterior: ultima?.fechaRegistro ?? null,
      unidad: 'horómetro',
    })
    if (a) advertencias.push(a)
  }
  if (data.kilometraje != null) {
    const a = calcularAdvertencia({
      valorNuevo: data.kilometraje,
      valorAnterior: Number(equipo.kilometrajeActual) || null,
      fechaAnterior: ultima?.fechaRegistro ?? null,
      unidad: 'kilometraje',
    })
    if (a) advertencias.push(a)
  }
  const advertencia = advertencias.length ? advertencias.join(' · ') : null

  const registro = await prisma.$transaction(async (tx) => {
    const r = await tx.horometroKm.create({
      data: {
        equipoId: data.equipoId,
        faenaId: equipo.faenaId,
        horometro: data.horometro,
        kilometraje: data.kilometraje,
        usuarioId: sesion.userId,
        origen: 'manual',
        advertencia,
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
  return { ...registro, advertencia }
}

// Corrige una lectura sin borrar la original: crea un nuevo registro marcado
// como corrección, vinculado al original, con motivo. El equipo pasa a
// reflejar el valor corregido.
export async function corregirLecturaHorometro(data: {
  loturaOriginalId: string
  horometro?: number
  kilometraje?: number
  motivo: string
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])
  if (!data.motivo?.trim()) throw new Error('Debe indicar el motivo de la corrección')
  if (!data.horometro && !data.kilometraje) throw new Error('Debe ingresar horómetro o kilometraje corregido')

  const original = await prisma.horometroKm.findUniqueOrThrow({
    where: { id: data.loturaOriginalId },
    select: { faenaId: true, equipoId: true },
  })
  requireAlcanceFaena(sesion, original.faenaId)

  const correccion = await prisma.$transaction(async (tx) => {
    const r = await tx.horometroKm.create({
      data: {
        equipoId: original.equipoId,
        faenaId: original.faenaId,
        horometro: data.horometro,
        kilometraje: data.kilometraje,
        usuarioId: sesion.userId,
        origen: 'correccion',
        esCorreccion: true,
        correccionDeId: data.loturaOriginalId,
        motivoCorreccion: data.motivo.trim(),
      },
    })

    await tx.equipo.update({
      where: { id: original.equipoId },
      data: {
        ...(data.horometro != null && { horometroActual: data.horometro }),
        ...(data.kilometraje != null && { kilometrajeActual: data.kilometraje }),
      },
    })

    return r
  })

  await auditar({
    faenaId: original.faenaId,
    entidad: 'HorometroKm',
    entidadId: data.loturaOriginalId,
    accion: 'CORREGIR',
    usuarioId: sesion.userId,
    valorNuevo: { horometro: data.horometro, kilometraje: data.kilometraje },
    motivo: data.motivo.trim(),
  })

  revalidatePath('/terreno/horometro')
  revalidatePath('/equipos')
  return correccion
}

export async function getEquiposParaHorometro() {
  const sesion = await requireSesion()

  return prisma.equipo.findMany({
    where: { faenaId: sesion.faenaId, activo: true },
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
  const sesion = await requireSesion()

  return prisma.horometroKm.findMany({
    where: { equipoId, faenaId: sesion.faenaId },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { fechaRegistro: 'desc' },
    take: 10,
  })
}
