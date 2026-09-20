import type { Prisma, PrismaClient } from '@prisma/client'

type Cliente = PrismaClient | Prisma.TransactionClient

/**
 * Abre el episodio de detención de un equipo si no hay uno abierto (idempotente). La hora de inicio es la del cambio a detenido,
 * exista o no una OT; una OT creada después NO la modifica.
 */
export async function abrirDetencion(c: Cliente, p: { equipoId: string; faenaId: string; origen: string; otId?: string | null; inicio?: Date }) {
  const abierta = await c.detencionEquipo.findFirst({ where: { equipoId: p.equipoId, fin: null }, select: { id: true } })
  if (abierta) return abierta.id
  try {
    return (await c.detencionEquipo.create({ data: { equipoId: p.equipoId, faenaId: p.faenaId, origen: p.origen, otId: p.otId ?? null, inicio: p.inicio ?? new Date() }, select: { id: true } })).id
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return null // otra petición la abrió a la vez: vale la primera
    throw e
  }
}

/** Cierra el episodio abierto: SOLO la liberación operacional lo termina. */
export async function cerrarDetencion(c: Cliente, equipoId: string, fin: Date = new Date()) {
  await c.detencionEquipo.updateMany({ where: { equipoId, fin: null }, data: { fin } })
}

/** Vincula la OT al episodio abierto sin tocar la hora inicial. */
export async function vincularOtADetencion(c: Cliente, equipoId: string, otId: string) {
  await c.detencionEquipo.updateMany({ where: { equipoId, fin: null, otId: null }, data: { otId } })
}

/**
 * Episodios y liberaciones de un equipo EN UNA FAENA (un equipo puede cambiar de faena: lo de otra faena no cuenta).
 * Los episodios se acotan a la ventana [inicio, termino] si se indica.
 */
export async function detencionesYLiberaciones(c: Cliente, equipoId: string, faenaId: string, ventana?: { inicio: Date; termino: Date }) {
  const [detenciones, liberaciones] = await Promise.all([
    c.detencionEquipo.findMany({
      where: { equipoId, faenaId, ...(ventana ? { inicio: { lte: ventana.termino }, OR: [{ fin: null }, { fin: { gte: ventana.inicio } }] } : {}) },
      select: { inicio: true, fin: true },
    }),
    c.liberacionEquipo.findMany({ where: { equipoId, faenaId }, select: { liberadoAt: true } }),
  ])
  return { detenciones, liberaciones }
}
