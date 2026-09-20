'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, ROLES_ALCANCE_CENTRAL } from '@/lib/authz'
import { serializar } from '@/lib/serialize'

// Cada usuario ve las notificaciones dirigidas a su rol; los roles de faena, solo las de su faena.
// Los roles centrales, Gerencia y el ADMINISTRADOR ven las de todas las faenas.
async function alcance() {
  const sesion = await requireSesion()
  const global = sesion.rol === 'GERENCIA' || ROLES_ALCANCE_CENTRAL.includes(sesion.rol)
  const donde = sesion.rol === 'ADMINISTRADOR' ? {} : { rolDestino: sesion.rol, ...(global ? {} : { faenaId: sesion.faenaId }) }
  return { sesion, donde }
}

export async function getAlertasInternas(soloNoLeidas = false) {
  const { donde } = await alcance()
  return serializar(await prisma.notificacion.findMany({ where: { ...donde, ...(soloNoLeidas ? { leidaAt: null } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 }))
}

export async function getConteoAlertasNoLeidas() {
  const { donde } = await alcance()
  return prisma.notificacion.count({ where: { ...donde, leidaAt: null } })
}

export async function marcarAlertaLeida(id: string) {
  const { donde } = await alcance()
  await prisma.notificacion.updateMany({ where: { id, ...donde, leidaAt: null }, data: { leidaAt: new Date() } })
  revalidatePath('/alertas')
}
