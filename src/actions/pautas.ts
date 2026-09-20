'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { hayOTPreventivaActiva } from '@/lib/mantenimiento-guard'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_APROBAR_PAUTA, ROLES_BITACORA, ROLES_CREAR_PLAN, ROLES_PROPONER_PAUTA } from '@/lib/permisos-roles'
import { auditar } from '@/lib/authz'
import { checklistDesdePautaTx } from '@/lib/checklist-pauta'
import type { CategoriaItemPM, TipoMetricaPM } from '@prisma/client'

export type EstadoPM = 'VENCIDA' | 'PROXIMA' | 'OT_ACTIVA' | 'OK'

export type EquipoPMStatus = {
  equipoId: string
  codigo: string
  nombre: string
  valorActual: number
  unidad: 'HRS' | 'KM'
  pauta: { id: string; nombre: string; ciclosDisponibles: number[] }
  cicloVencido: number | null
  cicloProximo: number
  restante: number
  estado: EstadoPM
  otActivaId: string | null
  otActivaCiclo: number | null
}

export async function getEstadoPM(): Promise<EquipoPMStatus[]> {
  const session = await auth()
  if (!session?.user?.faenaId) return []

  const UMBRAL = 100

  const equipos = await prisma.equipo.findMany({
    where: { faenaId: session.user.faenaId, activo: true, pautaId: { not: null } },
    include: {
      pauta: { select: { id: true, nombre: true, tipoMetrica: true, ciclosDisponibles: true } },
      ots: {
        where: { tipoMantenimiento: 'PREVENTIVO', estado: { not: 'CERRADA' } },
        select: { id: true, cicloPM: true, pautaId: true },
        orderBy: { fechaCreacion: 'desc' },
        take: 3,
      },
    },
    orderBy: { codigo: 'asc' },
  })

  const result: EquipoPMStatus[] = []

  for (const equipo of equipos) {
    if (!equipo.pauta || equipo.pauta.ciclosDisponibles.length === 0) continue

    const valorActual = equipo.pauta.tipoMetrica === 'HRS'
      ? Number(equipo.horometroActual)
      : Number(equipo.kilometrajeActual)

    const ciclos = equipo.pauta.ciclosDisponibles

    // Ciclos vencidos: valor actual divisible exactamente por el ciclo
    const vencidos = ciclos.filter(c => valorActual > 0 && valorActual % c === 0)
    const cicloVencido = vencidos.length > 0 ? Math.max(...vencidos) : null

    // Próximo ciclo estricto (mayor que valorActual)
    let cicloProximo = Infinity
    for (const c of ciclos) {
      const next = Math.ceil((valorActual + 0.001) / c) * c
      if (next < cicloProximo) cicloProximo = next
    }
    const restante = cicloProximo - valorActual

    // OT preventiva activa para este equipo
    const otActiva = equipo.ots.find(ot => ot.pautaId === equipo.pautaId)

    let estado: EstadoPM
    if (otActiva) {
      estado = 'OT_ACTIVA'
    } else if (cicloVencido !== null) {
      estado = 'VENCIDA'
    } else if (restante <= UMBRAL) {
      estado = 'PROXIMA'
    } else {
      estado = 'OK'
    }

    result.push({
      equipoId: equipo.id,
      codigo: equipo.codigo,
      nombre: equipo.nombre,
      valorActual,
      unidad: equipo.pauta.tipoMetrica as 'HRS' | 'KM',
      pauta: { id: equipo.pauta.id, nombre: equipo.pauta.nombre, ciclosDisponibles: ciclos },
      cicloVencido,
      cicloProximo: cicloProximo === Infinity ? ciclos[ciclos.length - 1] : cicloProximo,
      restante: cicloProximo === Infinity ? 0 : restante,
      estado,
      otActivaId: otActiva?.id ?? null,
      otActivaCiclo: otActiva?.cicloPM ?? null,
    })
  }

  const orden: Record<EstadoPM, number> = { VENCIDA: 0, PROXIMA: 1, OT_ACTIVA: 2, OK: 3 }
  return result.sort((a, b) => orden[a.estado] - orden[b.estado])
}

export async function getPautasDisponibles() {
  const session = await auth()
  if (!session?.user?.faenaId) return []
  return prisma.pautaMantenimiento.findMany({
    where: { faenaId: session.user.faenaId, activo: true, estadoAprobacion: 'APROBADA' },
    select: { id: true, nombre: true, tipoMetrica: true, ciclosDisponibles: true, codigosInternos: true },
    orderBy: { nombre: 'asc' },
  })
}

export async function vincularPautaEquipo(equipoId: string, pautaId: string | null) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')
  // Solo se vincula una pauta APROBADA y vigente de la misma faena.
  if (pautaId) {
    const pauta = await prisma.pautaMantenimiento.findFirst({ where: { id: pautaId, faenaId: session.user.faenaId, activo: true, estadoAprobacion: 'APROBADA' }, select: { id: true } })
    if (!pauta) throw new Error('La pauta no está aprobada, no está vigente o pertenece a otra faena')
  }
  await prisma.equipo.update({
    where: { id: equipoId, faenaId: session.user.faenaId },
    data: { pautaId },
  })
  revalidatePath(`/equipos/${equipoId}`)
}

export async function getPautaEquipo(equipoId: string) {
  const sesion = await requireSesion()
  const equipo = await prisma.equipo.findUnique({
    where: { id: equipoId, faenaId: sesion.faenaId },
    include: {
      pauta: {
        include: {
          items: { orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] },
        },
      },
    },
  })
  return equipo?.pauta ?? null
}

export async function crearChecklistDesdePauta(otId: string, pautaId: string, ciclo: number) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_CREAR_PLAN)
  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, ot.faenaId)

  return checklistDesdePautaTx(prisma, otId, pautaId, ciclo)
}

export async function programarPM(data: {
  equipoId: string
  pautaId: string
  ciclo: number
  fechaPlanificada: string
  observacion?: string
}) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const equipo = await prisma.equipo.findUnique({
    where: { id: data.equipoId, faenaId: session.user.faenaId },
    select: { costoHoraDetencion: true, codigo: true },
  })
  if (!equipo) throw new Error('Equipo no encontrado en esta faena')
  if (await hayOTPreventivaActiva(data.equipoId)) {
    throw new Error('Este equipo ya tiene una OT preventiva abierta (por plan o por pauta) — evita duplicados')
  }

  const unidad = await prisma.pautaMantenimiento.findFirst({
    where: { id: data.pautaId, faenaId: session.user.faenaId, estadoAprobacion: 'APROBADA' },
    select: { tipoMetrica: true },
  })
  if (!unidad) throw new Error('La pauta no está aprobada o pertenece a otra faena')

  const ot = await prisma.ordenTrabajo.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId,
      pautaId: data.pautaId,
      cicloPM: data.ciclo,
      tipoMantenimiento: 'PREVENTIVO',
      estado: 'PROGRAMADA',
      origenFalla: 'MANTENIMIENTO_PREVENTIVO',
      descripcionFalla: `PM ${data.ciclo.toLocaleString()} ${unidad?.tipoMetrica === 'HRS' ? 'hrs' : 'km'} programada${data.observacion ? ` — ${data.observacion}` : ''}`,
      prioridad: 'MEDIA',
      fechaCompromiso: new Date(data.fechaPlanificada),
      creadoPorId: session.user.id,
      costoHoraSnapshot: equipo?.costoHoraDetencion ?? 0,
      historial: {
        create: {
          estadoNuevo: 'PROGRAMADA',
          faenaId: session.user.faenaId,
          usuarioId: session.user.id,
          observacion: `PM programada para el ${new Date(data.fechaPlanificada).toLocaleDateString('es-CL')}`,
        },
      },
    },
  })

  await crearChecklistDesdePauta(ot.id, data.pautaId, data.ciclo)

  revalidatePath('/mantenimiento')
  revalidatePath('/ot')
  return ot.id
}

export async function marcarChecklistItem(
  itemId: string,
  resultado: 'OK' | 'NA' | 'OBSERVACION',
  observacion?: string
) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_BITACORA)
  const existente = await prisma.checklistItemOT.findUnique({ where: { id: itemId }, select: { ot: { select: { faenaId: true, tecnico: { select: { usuarioId: true } } } } } })
  if (!existente) throw new ErrorAutorizacion('Sin permisos: el ítem no existe o pertenece a otra faena')
  requireAlcanceFaena(sesion, existente.ot.faenaId)
  if (sesion.rol === 'MECANICO' && existente.ot.tecnico?.usuarioId !== sesion.userId) throw new ErrorAutorizacion('Sin permisos: el mecánico solo puede intervenir OT que tiene asignadas')

  await prisma.checklistItemOT.update({
    where: { id: itemId },
    data: {
      completado: resultado !== 'OBSERVACION',
      resultado,
      observacion: observacion || null,
      completadoAt: new Date(),
      completadoPor: sesion.userId,
    },
  })
}

// ── Versionado de pautas: una pauta nueva o modificada la propone la faena y la APRUEBA el Jefe de Taller Central ──
// La versión anterior no se sobrescribe; las OT que ya existen conservan la pauta (versión) que las originó.
type ItemNuevo = { componente: string; categoria: CategoriaItemPM; normativa?: string | null; alternativo?: string | null; cantidad?: number | null; unidad?: string | null; ciclosReemplazar?: number[]; ciclosCondicionar?: number[]; orden?: number }

export async function proponerVersionPauta(pautaId: string, data: { motivo: string; nombre?: string; ciclosDisponibles?: number[]; items?: ItemNuevo[] }) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_PROPONER_PAUTA)
  if (!data.motivo?.trim()) throw new Error('Debe indicar el motivo del cambio')
  const base = await prisma.pautaMantenimiento.findUniqueOrThrow({ where: { id: pautaId }, include: { items: true } })
  requireAlcanceFaena(sesion, base.faenaId)
  if (base.estadoAprobacion !== 'APROBADA') throw new Error('Solo se modifica una pauta aprobada')
  if (await prisma.pautaMantenimiento.findFirst({ where: { pautaAnteriorId: pautaId, estadoAprobacion: { in: ['PENDIENTE', 'APROBADA'] } } })) throw new Error('Esta pauta ya tiene una versión posterior o pendiente de aprobación')

  const nueva = await prisma.pautaMantenimiento.create({
    data: {
      faenaId: base.faenaId, nombre: data.nombre ?? base.nombre, marcaModelo: base.marcaModelo, codigosInternos: base.codigosInternos, tipoMetrica: base.tipoMetrica,
      ciclosDisponibles: data.ciclosDisponibles ?? base.ciclosDisponibles, activo: false, version: base.version + 1, estadoAprobacion: 'PENDIENTE', pautaAnteriorId: base.id, creadaPorId: sesion.userId, motivoCambio: data.motivo.trim(),
      items: { create: (data.items ?? base.items.map(i => ({ componente: i.componente, categoria: i.categoria, normativa: i.normativa, alternativo: i.alternativo, cantidad: i.cantidad === null ? null : Number(i.cantidad), unidad: i.unidad, ciclosReemplazar: i.ciclosReemplazar, ciclosCondicionar: i.ciclosCondicionar, orden: i.orden }))).map(i => ({ ...i, orden: i.orden ?? 0 })) },
    },
  })
  await auditar({ faenaId: base.faenaId, entidad: 'PautaMantenimiento', entidadId: nueva.id, accion: 'PROPONER_VERSION', usuarioId: sesion.userId, valorAnterior: { pautaId: base.id, version: base.version }, valorNuevo: { version: nueva.version }, motivo: data.motivo.trim() })
  return nueva.id
}

export async function proponerPautaNueva(data: { nombre: string; marcaModelo: string; tipoMetrica: TipoMetricaPM; ciclosDisponibles: number[]; items: ItemNuevo[]; motivo: string }) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_PROPONER_PAUTA)
  if (!data.motivo?.trim()) throw new Error('Debe indicar el motivo')
  const nueva = await prisma.pautaMantenimiento.create({
    data: { faenaId: sesion.faenaId, nombre: data.nombre, marcaModelo: data.marcaModelo, tipoMetrica: data.tipoMetrica, ciclosDisponibles: data.ciclosDisponibles, activo: false, estadoAprobacion: 'PENDIENTE', creadaPorId: sesion.userId, motivoCambio: data.motivo.trim(), items: { create: data.items.map(i => ({ ...i, orden: i.orden ?? 0 })) } },
  })
  await auditar({ faenaId: sesion.faenaId, entidad: 'PautaMantenimiento', entidadId: nueva.id, accion: 'PROPONER_PAUTA', usuarioId: sesion.userId, motivo: data.motivo.trim() })
  return nueva.id
}

export async function aprobarPauta(pautaId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_APROBAR_PAUTA)
  const pauta = await prisma.pautaMantenimiento.findUniqueOrThrow({ where: { id: pautaId } })
  requireAlcanceFaena(sesion, pauta.faenaId)
  if (pauta.creadaPorId === sesion.userId) throw new ErrorAutorizacion('Sin permisos: quien propuso la pauta no puede aprobarla')
  await prisma.$transaction(async (tx) => {
    const c = await tx.pautaMantenimiento.updateMany({ where: { id: pautaId, estadoAprobacion: 'PENDIENTE' }, data: { estadoAprobacion: 'APROBADA', activo: true, aprobadaPorId: sesion.userId, fechaAprobacion: new Date() } })
    if (c.count === 0) throw new Error('La pauta ya fue resuelta')
    // La versión anterior deja de ofrecerse, pero se conserva (y las OT que la usan siguen apuntando a ella).
    if (pauta.pautaAnteriorId) await tx.pautaMantenimiento.update({ where: { id: pauta.pautaAnteriorId }, data: { activo: false } })
  })
  await auditar({ faenaId: pauta.faenaId, entidad: 'PautaMantenimiento', entidadId: pautaId, accion: 'APROBAR_PAUTA', usuarioId: sesion.userId, valorNuevo: { version: pauta.version } })
  revalidatePath('/mantenimiento')
}

export async function rechazarPauta(pautaId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_APROBAR_PAUTA)
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo del rechazo')
  const pauta = await prisma.pautaMantenimiento.findUniqueOrThrow({ where: { id: pautaId } })
  requireAlcanceFaena(sesion, pauta.faenaId)
  const c = await prisma.pautaMantenimiento.updateMany({ where: { id: pautaId, estadoAprobacion: 'PENDIENTE' }, data: { estadoAprobacion: 'RECHAZADA', aprobadaPorId: sesion.userId, fechaAprobacion: new Date() } })
  if (c.count === 0) throw new Error('La pauta ya fue resuelta')
  await auditar({ faenaId: pauta.faenaId, entidad: 'PautaMantenimiento', entidadId: pautaId, accion: 'RECHAZAR_PAUTA', usuarioId: sesion.userId, motivo: motivo.trim() })
}
