'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { TipoEquipo, EstadoEquipo } from '@prisma/client'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, auditar, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_GESTION_OT, ROLES_LIBERAR_EQUIPO } from '@/lib/permisos-roles'
import { evaluarLiberacion } from '@/lib/liberacion'

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
  requireRolPermitido(await requireSesion(), ROLES_GESTION_OT)
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
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])
  const existente = await prisma.equipo.findUnique({ where: { id }, select: { faenaId: true } })
  if (!existente) throw new ErrorAutorizacion('Sin permisos: el equipo no existe o pertenece a otra faena')
  requireAlcanceFaena(sesion, existente.faenaId)

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
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])
  const existente = await prisma.equipo.findUnique({ where: { id }, select: { faenaId: true } })
  if (!existente) throw new ErrorAutorizacion('Sin permisos: el equipo no existe o pertenece a otra faena')
  requireAlcanceFaena(sesion, existente.faenaId)

  await prisma.equipo.update({ where: { id }, data: { activo: false } })
  revalidatePath('/equipos')
}

export async function actualizarEstadoEquipo(id: string, estado: EstadoEquipo) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_GESTION_OT)

  const actual = await prisma.equipo.findUniqueOrThrow({
    where: { id },
    select: { faenaId: true, estado: true },
  })
  requireAlcanceFaena(sesion, actual.faenaId)
  // Un equipo detenido solo vuelve a operar con la liberación operacional (valida reparación o exige motivo).
  const detenido = ['DETENIDO', 'DETENIDO_PENDIENTE_VALIDACION'].includes(actual.estado)
  if (detenido && ['OPERATIVO', 'OPERATIVO_CON_OBSERVACION'].includes(estado)) throw new Error('Un equipo detenido se libera con la liberación operacional (con validación técnica o motivo)')

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

const EN_CURSO = ['ABIERTA', 'EN_DIAGNOSTICO', 'DIAGNOSTICADO', 'REPARACION_PROGRAMADA', 'LISTO_PARA_REPARAR', 'EN_REPARACION', 'ESPERA_REPUESTO'] as const

// Liberación operacional: Jefe o Planificador de la MISMA faena. Con reparación exige la validación técnica previa;
// sin reparación exige motivo. Queda auditada.
export async function liberarEquipo(equipoId: string, motivo?: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_LIBERAR_EQUIPO)
  const equipo = await prisma.equipo.findUnique({ where: { id: equipoId }, select: { faenaId: true, estado: true } })
  if (!equipo) throw new ErrorAutorizacion('Sin permisos: el equipo no existe o pertenece a otra faena')
  if (equipo.faenaId !== sesion.faenaId) throw new ErrorAutorizacion('Sin permisos: el equipo pertenece a otra faena')

  const ultima = await prisma.registroAuditoria.findFirst({ where: { entidad: 'Equipo', entidadId: equipoId, accion: 'LIBERAR' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  const [enCurso, reparada] = await Promise.all([
    prisma.ordenTrabajo.count({ where: { equipoId, faenaId: equipo.faenaId, tipoMantenimiento: 'CORRECTIVO', estado: { in: [...EN_CURSO] } } }),
    prisma.ordenTrabajo.findFirst({ where: { equipoId, faenaId: equipo.faenaId, estado: { in: ['EN_VALIDACION', 'CERRADA'] }, fechaTerminoTrabajo: { gt: ultima?.createdAt ?? new Date(0) } }, orderBy: { fechaTerminoTrabajo: 'desc' }, select: { fechaValidacionTecnica: true } }),
  ])
  const error = evaluarLiberacion({ estadoEquipo: equipo.estado, hayOtEnCurso: enCurso > 0, otReparada: reparada ? { validadaTecnicamente: !!reparada.fechaValidacionTecnica } : null, motivo })
  if (error) throw new Error(error)

  const r = await prisma.equipo.updateMany({ where: { id: equipoId, estado: equipo.estado }, data: { estado: 'OPERATIVO' } })
  if (r.count === 0) throw new Error('El equipo cambió de estado mientras se liberaba; recarga e intenta de nuevo')
  await auditar({ faenaId: equipo.faenaId, entidad: 'Equipo', entidadId: equipoId, accion: 'LIBERAR', usuarioId: sesion.userId, valorAnterior: { estado: equipo.estado }, valorNuevo: { estado: 'OPERATIVO', conReparacion: !!reparada }, motivo: motivo?.trim() || null })
  revalidatePath('/equipos'); revalidatePath('/dashboard')
}
