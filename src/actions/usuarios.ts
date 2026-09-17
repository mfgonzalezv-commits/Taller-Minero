'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { RolUsuario } from '@prisma/client'
import { hash } from 'bcryptjs'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'

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
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')
  if (session.user.rol !== 'ADMINISTRADOR' && session.user.rol !== 'JEFE_TALLER') {
    throw new Error('Sin permisos')
  }

  const passwordHash = await hash(data.password, 10)

  const usuario = await prisma.usuario.create({
    data: {
      faenaId: session.user.faenaId,
      nombre: data.nombre,
      email: data.email,
      password: passwordHash,
      rol: data.rol,
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
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER'])

  const objetivo = await prisma.usuario.findUniqueOrThrow({ where: { id }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, objetivo.faenaId)

  const updateData: Record<string, unknown> = {
    nombre: data.nombre,
    email: data.email,
    rol: data.rol,
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
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER'])

  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id } })
  requireAlcanceFaena(sesion, usuario.faenaId)

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
