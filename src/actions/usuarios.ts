'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { RolUsuario } from '@prisma/client'
import { hash } from 'bcryptjs'
import { requireSesion, requireAlcanceFaena, auditar, ErrorAutorizacion } from '@/lib/authz'
import { validarGestionUsuario } from '@/lib/permisos-roles'
import { normalizarTurno, validarTurno } from '@/lib/turnos'

export async function getUsuarios() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.usuario.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    include: { tecnico: true },
    orderBy: { nombre: 'asc' },
  })
}

export async function crearUsuario(data: {
  nombre: string
  email: string
  password: string
  rol: RolUsuario
  especialidades?: string[]
  turno?: string
  /** Régimen de turnos (opcional): '7X7' | '14X14' y grupo 'A' | 'B'. `turno` sigue siendo la jornada Día/Noche. */
  sistemaTurno?: string
  grupoTurno?: string
}) {
  const sesion = await requireSesion()
  const errTurno = validarTurno(data)
  if (errTurno) throw new Error(errTurno)
  const denegado = validarGestionUsuario({ actorId: sesion.userId, actorRol: sesion.rol, rolNuevo: data.rol })
  if (denegado) throw new ErrorAutorizacion(denegado)
  const session = { user: { faenaId: sesion.faenaId } }

  const passwordHash = await hash(data.password, 10)

  const usuario = await prisma.usuario.create({
    data: {
      faenaId: session.user.faenaId,
      nombre: data.nombre,
      email: data.email,
      password: passwordHash,
      rol: data.rol,
      ...normalizarTurno(data),
      ...(data.rol === 'MECANICO' && {
        tecnico: {
          create: {
            faenaId: session.user.faenaId,
            especialidades: data.especialidades ?? [],
            turno: data.turno,
          },
        },
      }),
    },
  })

  revalidatePath('/usuarios')
  return usuario
}

export async function getUsuarioById(id: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.usuario.findFirst({
    where: { id, faenaId: session.user.faenaId },
    include: { tecnico: true },
  })
}

export async function actualizarUsuario(id: string, data: {
  nombre: string
  email: string
  rol: RolUsuario
  especialidades?: string[]
  turno?: string
  password?: string
  sistemaTurno?: string | null
  grupoTurno?: string | null
}) {
  const sesion = await requireSesion()
  const errTurno = validarTurno(data)
  if (errTurno) throw new Error(errTurno)

  const objetivo = await prisma.usuario.findUniqueOrThrow({ where: { id }, select: { faenaId: true, rol: true } })
  requireAlcanceFaena(sesion, objetivo.faenaId)
  const denegado = validarGestionUsuario({ actorId: sesion.userId, actorRol: sesion.rol, objetivoId: id, objetivoRolActual: objetivo.rol, rolNuevo: data.rol })
  if (denegado) throw new ErrorAutorizacion(denegado)

  const updateData: Record<string, unknown> = {
    nombre: data.nombre,
    email: data.email,
    rol: data.rol,
    ...(data.sistemaTurno !== undefined || data.grupoTurno !== undefined ? normalizarTurno(data) : {}),
  }
  if (data.password && data.password.length >= 6) {
    updateData.password = await hash(data.password, 10)
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data: updateData,
    include: { tecnico: true },
  })

  if (data.rol === 'MECANICO') {
    if (usuario.tecnico) {
      await prisma.tecnico.update({
        where: { usuarioId: id },
        data: { especialidades: data.especialidades ?? [], turno: data.turno },
      })
    } else {
      await prisma.tecnico.create({
        data: {
          usuarioId: id,
          faenaId: objetivo.faenaId,
          especialidades: data.especialidades ?? [],
          turno: data.turno,
        },
      })
    }
  }

  await auditar({
    faenaId: objetivo.faenaId,
    entidad: 'Usuario',
    entidadId: id,
    accion: 'ACTUALIZAR',
    usuarioId: sesion.userId,
    valorNuevo: { nombre: data.nombre, email: data.email, rol: data.rol, passwordCambiada: !!updateData.password },
  })

  revalidatePath('/usuarios')
  revalidatePath(`/usuarios/${id}/editar`)
  return usuario
}

export async function toggleUsuarioActivo(id: string) {
  const sesion = await requireSesion()

  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id } })
  requireAlcanceFaena(sesion, usuario.faenaId)
  const denegado = validarGestionUsuario({ actorId: sesion.userId, actorRol: sesion.rol, objetivoId: id, objetivoRolActual: usuario.rol })
  if (denegado) throw new ErrorAutorizacion(denegado)
  if (id === sesion.userId) throw new ErrorAutorizacion('No puedes desactivarte a ti mismo')

  await prisma.usuario.update({
    where: { id },
    data: { activo: !usuario.activo },
  })

  await auditar({
    faenaId: usuario.faenaId,
    entidad: 'Usuario',
    entidadId: id,
    accion: usuario.activo ? 'DESACTIVAR' : 'ACTIVAR',
    usuarioId: sesion.userId,
    valorAnterior: { activo: usuario.activo },
    valorNuevo: { activo: !usuario.activo },
  })

  revalidatePath('/usuarios')
}
