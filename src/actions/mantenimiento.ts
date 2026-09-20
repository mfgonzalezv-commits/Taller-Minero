'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { hayOTPreventivaActiva } from '@/lib/mantenimiento-guard'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'
import { ROLES_CREAR_PLAN, ROLES_BITACORA } from '@/lib/permisos-roles'

// ─── Ciclos ──────────────────────────────────────────────────────────────────

export async function getCiclos() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const ciclos = await prisma.cicloMantenimiento.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    include: {
      equipo: { select: { id: true, codigo: true, nombre: true } },
      planes: {
        where: { activo: true },
        include: { tareas: { orderBy: { orden: 'asc' } } },
        orderBy: { intervaloHoras: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return ciclos.map(c => ({
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion,
    equipo: c.equipo,
    planes: c.planes.map(p => ({
      id: p.id,
      nombre: p.nombre,
      intervaloHoras: p.intervaloHoras ? Number(p.intervaloHoras) : null,
      intervaloKm: p.intervaloKm ? Number(p.intervaloKm) : null,
      intervaloDias: p.intervaloDias,
      tareas: p.tareas,
    })),
  }))
}

export async function crearCiclo(data: {
  equipoId: string
  nombre: string
  descripcion?: string
}) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const ciclo = await prisma.cicloMantenimiento.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId,
      nombre: data.nombre,
      descripcion: data.descripcion,
    },
  })

  revalidatePath('/mantenimiento')
  return ciclo.id
}

export async function eliminarCiclo(id: string) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.cicloMantenimiento.update({ where: { id, faenaId: session.user.faenaId }, data: { activo: false } })
  revalidatePath('/mantenimiento')
}

// ─── Planes ───────────────────────────────────────────────────────────────────

export async function getPlanes() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const planes = await prisma.planMantenimiento.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    include: {
      equipo: {
        select: { id: true, codigo: true, nombre: true, horometroActual: true, kilometrajeActual: true },
      },
      ciclo: { select: { id: true, nombre: true } },
      tareas: { orderBy: { orden: 'asc' } },
      ejecuciones: {
        orderBy: { fechaEjecucion: 'desc' },
        take: 5,
        include: { usuario: { select: { nombre: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const hoy = new Date()

  return planes.map((p) => {
    const horoActual = Number(p.equipo.horometroActual)
    const kmActual = Number(p.equipo.kilometrajeActual)
    const proxHoras = p.proximaEjecucionHoras ? Number(p.proximaEjecucionHoras) : null
    const proxKm = p.proximaEjecucionKm ? Number(p.proximaEjecucionKm) : null
    const proxFecha = p.proximaEjecucionFecha ?? null

    const alertaHoras = proxHoras !== null ? Math.round(proxHoras - horoActual) : null
    const alertaKm = proxKm !== null ? Math.round(proxKm - kmActual) : null
    const alertaDias = proxFecha !== null
      ? Math.round((proxFecha.getTime() - hoy.getTime()) / 86400000)
      : null

    const urgente =
      (alertaHoras !== null && alertaHoras <= 50 && alertaHoras > 0) ||
      (alertaKm !== null && alertaKm <= 500 && alertaKm > 0) ||
      (alertaDias !== null && alertaDias <= 7 && alertaDias > 0)

    const vencido =
      (alertaHoras !== null && alertaHoras <= 0) ||
      (alertaKm !== null && alertaKm <= 0) ||
      (alertaDias !== null && alertaDias <= 0)

    return {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      intervaloHoras: p.intervaloHoras ? Number(p.intervaloHoras) : null,
      intervaloKm: p.intervaloKm ? Number(p.intervaloKm) : null,
      intervaloDias: p.intervaloDias,
      proximaEjecucionHoras: proxHoras,
      proximaEjecucionKm: proxKm,
      proximaEjecucionFecha: proxFecha?.toISOString() ?? null,
      ultimaEjecucion: p.ultimaEjecucion?.toISOString() ?? null,
      fechaProgramada: p.fechaProgramada?.toISOString() ?? null,
      otActivaId: p.otActivaId,
      alertaHoras,
      alertaKm,
      alertaDias,
      urgente,
      vencido,
      ciclo: p.ciclo ? { id: p.ciclo.id, nombre: p.ciclo.nombre } : null,
      tareas: p.tareas.map(t => ({
        id: t.id,
        descripcion: t.descripcion,
        codigo: t.codigo,
        cantidad: t.cantidad ? Number(t.cantidad) : null,
        unidad: t.unidad,
        obligatorio: t.obligatorio,
        orden: t.orden,
      })),
      ejecuciones: p.ejecuciones.map(e => ({
        id: e.id,
        fechaEjecucion: e.fechaEjecucion.toISOString(),
        horometroAlEjecutar: e.horometroAlEjecutar ? Number(e.horometroAlEjecutar) : null,
        kmAlEjecutar: e.kmAlEjecutar ? Number(e.kmAlEjecutar) : null,
        otId: e.otId,
        observacion: e.observacion,
        usuario: e.usuario,
      })),
      equipo: {
        id: p.equipo.id,
        codigo: p.equipo.codigo,
        nombre: p.equipo.nombre,
        horometroActual: horoActual,
        kilometrajeActual: kmActual,
      },
    }
  })
}

export async function crearPlan(data: {
  equipoId: string
  cicloId?: string
  nombre: string
  descripcion?: string
  intervaloHoras?: number
  intervaloKm?: number
  intervaloDias?: number
  tareas?: { descripcion: string; obligatorio: boolean }[]
}) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')
  if (!data.intervaloHoras && !data.intervaloKm && !data.intervaloDias) {
    throw new Error('Debe definir al menos un intervalo (horas, km o días)')
  }

  const equipo = await prisma.equipo.findUnique({
    where: { id: data.equipoId, faenaId: session.user.faenaId },
    select: { horometroActual: true, kilometrajeActual: true },
  })
  if (!equipo) throw new Error('Equipo no encontrado en esta faena')

  const proximaFecha = data.intervaloDias
    ? new Date(Date.now() + data.intervaloDias * 86400000)
    : undefined

  const plan = await prisma.planMantenimiento.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId,
      cicloId: data.cicloId || undefined,
      nombre: data.nombre,
      descripcion: data.descripcion,
      intervaloHoras: data.intervaloHoras,
      intervaloKm: data.intervaloKm,
      intervaloDias: data.intervaloDias,
      proximaEjecucionHoras: data.intervaloHoras && equipo
        ? Number(equipo.horometroActual) + data.intervaloHoras
        : undefined,
      proximaEjecucionKm: data.intervaloKm && equipo
        ? Number(equipo.kilometrajeActual) + data.intervaloKm
        : undefined,
      proximaEjecucionFecha: proximaFecha,
    },
  })

  if (data.tareas?.length) {
    await prisma.tareaMantenimiento.createMany({
      data: data.tareas.map((t, i) => ({
        planId: plan.id,
        descripcion: t.descripcion,
        obligatorio: t.obligatorio,
        orden: i,
      })),
    })
  }

  revalidatePath('/mantenimiento')
}

export async function programarParada(planId: string, fechaProgramada: string, motivo?: string) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  // Reprogramar (ya había una fecha) exige motivo; programar por primera vez no.
  const actual = await prisma.planMantenimiento.findFirst({ where: { id: planId, faenaId: session.user.faenaId }, select: { fechaProgramada: true, faenaId: true } })
  if (!actual) throw new Error('Sin permisos: el plan no existe o pertenece a otra faena')
  if (actual.fechaProgramada && !motivo?.trim()) throw new Error('Reprogramar una mantención exige indicar el motivo')
  if (actual.fechaProgramada) await auditar({ faenaId: actual.faenaId, entidad: 'PlanMantenimiento', entidadId: planId, accion: 'REPROGRAMAR', usuarioId: session.user.id, valorAnterior: { fechaProgramada: actual.fechaProgramada }, valorNuevo: { fechaProgramada }, motivo: motivo!.trim() })

  await prisma.planMantenimiento.update({
    where: { id: planId, faenaId: session.user.faenaId },
    data: { fechaProgramada: new Date(fechaProgramada) },
  })

  revalidatePath('/mantenimiento')
}

// Postergar una mantención ya programada requiere justificación y solo lo
// pueden hacer Jefe de Taller Central, Planificador Central o Jefe de Taller
// de la faena — no es una reprogramación libre.
export async function postergarPlan(planId: string, nuevaFecha: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])
  if (!motivo?.trim()) throw new Error('Debe justificar la reprogramación')

  const plan = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: planId } })
  requireAlcanceFaena(sesion, plan.faenaId)

  await prisma.planMantenimiento.update({
    where: { id: planId },
    data: { fechaProgramada: new Date(nuevaFecha) },
  })

  await auditar({
    faenaId: plan.faenaId,
    entidad: 'PlanMantenimiento',
    entidadId: planId,
    accion: 'POSTERGAR',
    usuarioId: sesion.userId,
    valorAnterior: { fechaProgramada: plan.fechaProgramada },
    valorNuevo: { fechaProgramada: nuevaFecha },
    motivo: motivo.trim(),
  })

  revalidatePath('/mantenimiento')
}

export async function generarOT(planId: string) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const plan = await prisma.planMantenimiento.findUniqueOrThrow({
    where: { id: planId },
    include: {
      equipo: true,
      tareas: { orderBy: { orden: 'asc' } },
    },
  })
  if (plan.faenaId !== session.user.faenaId) throw new Error('Sin permisos: el plan pertenece a otra faena')

  if (plan.otActivaId) throw new Error('Ya existe una OT activa para este plan')
  if (await hayOTPreventivaActiva(plan.equipoId)) {
    throw new Error('Este equipo ya tiene una OT preventiva abierta (por plan o por pauta) — evita duplicados')
  }

  const ot = await prisma.ordenTrabajo.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: plan.equipoId,
      tipoMantenimiento: 'PREVENTIVO',
      estado: 'PROGRAMADA',
      prioridad: 'MEDIA',
      descripcionFalla: plan.nombre + (plan.descripcion ? ` — ${plan.descripcion}` : ''),
      fechaCompromiso: plan.fechaProgramada ?? undefined,
      planMantenimientoId: plan.id,
      creadoPorId: session.user.id,
    },
  })

  // Copiar tareas del plan como checklist de la OT
  if (plan.tareas.length) {
    await prisma.checklistItemOT.createMany({
      data: plan.tareas.map(t => ({
        otId: ot.id,
        descripcion: t.descripcion,
        codigo: t.codigo,
        cantidad: t.cantidad,
        unidad: t.unidad,
        obligatorio: t.obligatorio,
        orden: t.orden,
      })),
    })
  }

  await prisma.planMantenimiento.update({
    where: { id: planId },
    data: { otActivaId: ot.id },
  })

  revalidatePath('/mantenimiento')
  revalidatePath('/ot')
  return ot.id
}

export async function registrarEjecucion(planId: string, observacion?: string) {
  requireRolPermitido(await requireSesion(), ROLES_BITACORA)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const plan = await prisma.planMantenimiento.findUniqueOrThrow({
    where: { id: planId },
    include: { equipo: { select: { horometroActual: true, kilometrajeActual: true } } },
  })
  if (plan.faenaId !== session.user.faenaId) throw new Error('Sin permisos: el plan pertenece a otra faena')

  const horoActual = Number(plan.equipo.horometroActual)
  const kmActual = Number(plan.equipo.kilometrajeActual)
  const ahora = new Date()

  const proximaFecha = plan.intervaloDias
    ? new Date(ahora.getTime() + plan.intervaloDias * 86400000)
    : undefined

  await prisma.$transaction([
    prisma.ejecucionMantenimiento.create({
      data: {
        planId,
        fechaEjecucion: ahora,
        horometroAlEjecutar: horoActual,
        kmAlEjecutar: kmActual,
        otId: plan.otActivaId,
        observacion: observacion || undefined,
        usuarioId: session.user.id,
      },
    }),
    prisma.planMantenimiento.update({
      where: { id: planId },
      data: {
        ultimaEjecucion: ahora,
        fechaProgramada: null,
        otActivaId: null,
        proximaEjecucionHoras: plan.intervaloHoras
          ? horoActual + Number(plan.intervaloHoras)
          : undefined,
        proximaEjecucionKm: plan.intervaloKm
          ? kmActual + Number(plan.intervaloKm)
          : undefined,
        proximaEjecucionFecha: proximaFecha,
      },
    }),
  ])

  revalidatePath('/mantenimiento')
}

export async function eliminarPlan(id: string) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.planMantenimiento.update({ where: { id, faenaId: session.user.faenaId }, data: { activo: false } })
  revalidatePath('/mantenimiento')
}

// ─── Importar pauta desde Excel/TSV ──────────────────────────────────────────

type FilaTareaImport = {
  nivel: number          // horas (ej: 250, 1000, 2000)
  nombrePlan: string     // nombre del nivel (ej: "PM250")
  descripcion: string    // descripción de la tarea
  codigo?: string        // código de repuesto/filtro
  cantidad?: number      // cantidad
  unidad?: string        // lt, un, kg, etc.
}

export async function importarPauta(data: {
  equipoId: string
  cicloNombre: string
  filas: FilaTareaImport[]
}) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  if (!data.filas.length) throw new Error('No hay filas para importar')

  const equipo = await prisma.equipo.findUnique({
    where: { id: data.equipoId, faenaId: session.user.faenaId },
    select: { horometroActual: true, kilometrajeActual: true },
  })
  if (!equipo) throw new Error('Equipo no encontrado en esta faena')

  // Crear ciclo
  const ciclo = await prisma.cicloMantenimiento.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId,
      nombre: data.cicloNombre,
    },
  })

  // Agrupar filas por nivel
  const porNivel = new Map<number, FilaTareaImport[]>()
  for (const fila of data.filas) {
    if (!porNivel.has(fila.nivel)) porNivel.set(fila.nivel, [])
    porNivel.get(fila.nivel)!.push(fila)
  }

  const niveles = Array.from(porNivel.keys()).sort((a, b) => a - b)

  // Crear un plan por nivel con sus tareas
  for (const nivel of niveles) {
    const filas = porNivel.get(nivel)!
    const nombrePlan = filas[0].nombrePlan || `PM${nivel}`

    const plan = await prisma.planMantenimiento.create({
      data: {
        faenaId: session.user.faenaId,
        equipoId: data.equipoId,
        cicloId: ciclo.id,
        nombre: nombrePlan,
        intervaloHoras: nivel,
        proximaEjecucionHoras: Number(equipo.horometroActual) + nivel,
      },
    })

    await prisma.tareaMantenimiento.createMany({
      data: filas.map((f, i) => ({
        planId: plan.id,
        descripcion: f.descripcion,
        codigo: f.codigo || null,
        cantidad: f.cantidad ?? null,
        unidad: f.unidad || 'un',
        obligatorio: true,
        orden: i,
      })),
    })
  }

  revalidatePath('/mantenimiento')
  return { cicloId: ciclo.id, planes: niveles.length, tareas: data.filas.length }
}
