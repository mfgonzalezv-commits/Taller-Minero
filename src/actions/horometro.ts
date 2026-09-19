'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'
import { serializar } from '@/lib/serialize'
import { evaluarLectura } from '@/lib/horometro-politica'

// Solo las lecturas confirmadas cuentan: las pendientes de confirmación (validado = false) no se usan.
const LECTURA_USABLE = { OR: [{ validado: null }, { validado: true }] }
const ROLES_CONFIRMAR_LECTURA = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'] as const

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
    where: { equipoId: data.equipoId, ...LECTURA_USABLE },
    orderBy: { fechaRegistro: 'desc' },
    select: { fechaRegistro: true },
  })

  const evaluaciones = [
    data.horometro != null && evaluarLectura({ valorNuevo: data.horometro, valorAnterior: Number(equipo.horometroActual) || null, fechaAnterior: ultima?.fechaRegistro ?? null, unidad: 'horómetro' }),
    data.kilometraje != null && evaluarLectura({ valorNuevo: data.kilometraje, valorAnterior: Number(equipo.kilometrajeActual) || null, fechaAnterior: ultima?.fechaRegistro ?? null, unidad: 'kilometraje' }),
  ].filter((e): e is Exclude<typeof e, false> => e !== false)
  // Lectura menor: bloqueada (se corrige solo con la acción de corrección).
  for (const e of evaluaciones) if (e.tipo === 'MENOR') throw new Error(e.mensaje)
  // Salto anómalo: queda pendiente de confirmación y no se usa hasta entonces.
  const saltos = evaluaciones.flatMap(e => (e.tipo === 'SALTO' ? [e.mensaje] : []))
  const pendiente = saltos.length > 0
  const advertencia = pendiente ? saltos.join(' · ') : null

  const registro = await prisma.$transaction(async (tx) => {
    const r = await tx.horometroKm.create({
      data: {
        equipoId: data.equipoId,
        faenaId: equipo.faenaId,
        horometro: data.horometro,
        kilometraje: data.kilometraje,
        usuarioId: sesion.userId,
        origen: pendiente ? 'pendiente_confirmacion' : 'manual',
        advertencia,
        validado: pendiente ? false : null,
      },
    })

    if (!pendiente) {
      await tx.equipo.update({
        where: { id: data.equipoId },
        data: {
          ...(data.horometro != null && { horometroActual: data.horometro }),
          ...(data.kilometraje != null && { kilometrajeActual: data.kilometraje }),
        },
      })
    }

    return r
  })

  revalidatePath('/terreno/horometro')
  revalidatePath('/equipos')
  return { ...serializar(registro), advertencia, pendiente }
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

// Un Jefe o Planificador confirma un salto anómalo: recién ahí la lectura se usa.
export async function confirmarLecturaHorometro(lecturaId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, [...ROLES_CONFIRMAR_LECTURA])

  const lectura = await prisma.horometroKm.findUniqueOrThrow({ where: { id: lecturaId } })
  requireAlcanceFaena(sesion, lectura.faenaId)

  await prisma.$transaction(async (tx) => {
    const r = await tx.horometroKm.updateMany({ where: { id: lecturaId, validado: false, origen: 'pendiente_confirmacion' }, data: { validado: true, origen: 'manual' } })
    if (r.count === 0) throw new Error('La lectura ya fue confirmada o rechazada')
    const equipo = await tx.equipo.findUniqueOrThrow({ where: { id: lectura.equipoId }, select: { horometroActual: true, kilometrajeActual: true } })
    await tx.equipo.update({
      where: { id: lectura.equipoId },
      data: {
        ...(lectura.horometro != null && Number(lectura.horometro) >= Number(equipo.horometroActual) && { horometroActual: lectura.horometro }),
        ...(lectura.kilometraje != null && Number(lectura.kilometraje) >= Number(equipo.kilometrajeActual) && { kilometrajeActual: lectura.kilometraje }),
      },
    })
  })

  await auditar({ faenaId: lectura.faenaId, entidad: 'HorometroKm', entidadId: lecturaId, accion: 'CONFIRMAR_SALTO', usuarioId: sesion.userId, valorNuevo: { horometro: Number(lectura.horometro), kilometraje: Number(lectura.kilometraje) } })
  revalidatePath('/terreno/horometro')
  revalidatePath('/equipos')
}

export async function rechazarLecturaHorometro(lecturaId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, [...ROLES_CONFIRMAR_LECTURA])
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo del rechazo')

  const lectura = await prisma.horometroKm.findUniqueOrThrow({ where: { id: lecturaId } })
  requireAlcanceFaena(sesion, lectura.faenaId)
  const r = await prisma.horometroKm.updateMany({ where: { id: lecturaId, validado: false, origen: 'pendiente_confirmacion' }, data: { origen: 'rechazada', motivoCorreccion: motivo.trim() } })
  if (r.count === 0) throw new Error('La lectura ya fue confirmada o rechazada')

  await auditar({ faenaId: lectura.faenaId, entidad: 'HorometroKm', entidadId: lecturaId, accion: 'RECHAZAR_SALTO', usuarioId: sesion.userId, motivo: motivo.trim() })
  revalidatePath('/terreno/horometro')
}

export async function getLecturasPendientes() {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, [...ROLES_CONFIRMAR_LECTURA])
  return serializar(await prisma.horometroKm.findMany({
    where: { faenaId: sesion.faenaId, validado: false, origen: 'pendiente_confirmacion' },
    include: { equipo: { select: { codigo: true, nombre: true } }, usuario: { select: { nombre: true } } },
    orderBy: { fechaRegistro: 'desc' },
  }))
}

export async function getEquiposParaHorometro() {
  const sesion = await requireSesion()

  const equipos = await prisma.equipo.findMany({
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

  return serializar(equipos)
}

export async function getUltimosHorometros(equipoId: string) {
  const sesion = await requireSesion()

  return prisma.horometroKm.findMany({
    where: { equipoId, faenaId: sesion.faenaId, origen: { not: 'rechazada' } },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { fechaRegistro: 'desc' },
    take: 10,
  })
}
