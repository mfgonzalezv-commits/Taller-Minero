'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { CriticidadInspeccion, ResultadoItem, TurnoInspeccion } from '@prisma/client'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_CREAR_PLAN, ROLES_CREAR_OT, ROLES_GESTION_OT } from '@/lib/permisos-roles'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'

// Quién inspecciona: operación y gestión de la faena (no Bodega/Compras/Gerencia).
const ROLES_INSPECCION = [...ROLES_GESTION_OT, 'MECANICO', 'OPERADOR'] as const
const PREFIJO_CRITICO = 'Hallazgo crítico en inspección diaria'

// ─── Plantillas ───────────────────────────────────────────────────────────────

export async function getPlantillas() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const plantillas = await prisma.plantillaInspeccion.findMany({
    where: { faenaId: session.user.faenaId, activo: true },
    include: {
      equipo: { select: { id: true, codigo: true, nombre: true } },
      items: { orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] },
    },
    orderBy: { createdAt: 'asc' },
  })

  return plantillas
}

export async function crearPlantilla(data: {
  equipoId?: string
  nombre: string
  items: { categoria: string; descripcion: string; criticidadBase: CriticidadInspeccion; orden: number }[]
}) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const plantilla = await prisma.plantillaInspeccion.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId || null,
      nombre: data.nombre,
    },
  })

  if (data.items.length) {
    await prisma.itemPlantillaInspeccion.createMany({
      data: data.items.map(item => ({
        plantillaId: plantilla.id,
        categoria: item.categoria,
        descripcion: item.descripcion,
        criticidadBase: item.criticidadBase,
        orden: item.orden,
      })),
    })
  }

  revalidatePath('/inspeccion')
  revalidatePath('/inspeccion/plantillas')
  return plantilla.id
}

export async function eliminarPlantilla(id: string) {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.plantillaInspeccion.update({ where: { id, faenaId: session.user.faenaId }, data: { activo: false } })
  revalidatePath('/inspeccion/plantillas')
}

// ─── Inspecciones ─────────────────────────────────────────────────────────────

export async function getInspecciones(limit = 50) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.inspeccionDiaria.findMany({
    where: { faenaId: session.user.faenaId },
    include: {
      equipo: { select: { id: true, codigo: true, nombre: true } },
      operador: { select: { nombre: true } },
      resultados: { select: { resultado: true } },
      alertas: { select: { id: true, criticidad: true, estado: true } },
    },
    orderBy: { fecha: 'desc' },
    take: limit,
  })
}

export async function crearInspeccion(data: {
  equipoId: string
  plantillaId: string
  turno: TurnoInspeccion
  observacion?: string
  resultados: { itemId: string; resultado: ResultadoItem; observacion?: string }[]
  /** Generada por el formulario: repetir la misma operación (doble clic) devuelve la inspección ya creada. */
  claveIdempotencia?: string
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, [...ROLES_INSPECCION])

  const resumen = async (inspeccionId: string) => {
    const [alertas, criticos, reporte] = await Promise.all([
      prisma.alertaInspeccion.count({ where: { inspeccionId } }),
      prisma.alertaInspeccion.count({ where: { inspeccionId, criticidad: 'CRITICO' } }),
      prisma.reporteFalla.findFirst({ where: { inspeccionId }, select: { id: true } }),
    ])
    return { inspeccionId, alertas, criticos, reporteId: reporte?.id ?? null, repetida: true }
  }

  // Doble clic / reintento con la misma clave: devolver lo ya creado.
  if (data.claveIdempotencia) {
    const previa = await prisma.inspeccionDiaria.findUnique({ where: { faenaId_claveIdempotencia: { faenaId: sesion.faenaId, claveIdempotencia: data.claveIdempotencia } }, select: { id: true } })
    if (previa) return resumen(previa.id)
  }

  // Entidades relacionadas: equipo y plantilla deben ser de la faena del operador.
  const equipo = await prisma.equipo.findUnique({ where: { id: data.equipoId }, select: { faenaId: true } })
  if (!equipo || equipo.faenaId !== sesion.faenaId) throw new ErrorAutorizacion('Sin permisos: el equipo no existe o pertenece a otra faena')
  const plantilla = await prisma.plantillaInspeccion.findUnique({ where: { id: data.plantillaId }, include: { items: { select: { id: true } } } })
  if (!plantilla || plantilla.faenaId !== sesion.faenaId) throw new ErrorAutorizacion('Sin permisos: la plantilla no existe o pertenece a otra faena')
  if (plantilla.equipoId && plantilla.equipoId !== data.equipoId) throw new Error('La plantilla no corresponde a ese equipo')
  const itemsValidos = new Set(plantilla.items.map(i => i.id))
  const vistos = new Set<string>()
  for (const r of data.resultados) {
    if (!itemsValidos.has(r.itemId)) throw new ErrorAutorizacion('Sin permisos: un ítem no pertenece a la plantilla')
    if (vistos.has(r.itemId)) throw new Error('Un ítem de la inspección viene repetido')
    vistos.add(r.itemId)
  }

  try {
    // Todo o nada: inspección, resultados, alertas, reporte de falla y detención del equipo.
    return await prisma.$transaction(async (tx) => {
      const inspeccion = await tx.inspeccionDiaria.create({
        data: {
          faenaId: sesion.faenaId, equipoId: data.equipoId, plantillaId: data.plantillaId, turno: data.turno,
          operadorId: sesion.userId, completada: true, observacion: data.observacion, claveIdempotencia: data.claveIdempotencia ?? null,
        },
      })

      const resultadosCreados = []
      for (const r of data.resultados) {
        resultadosCreados.push(await tx.resultadoInspeccion.create({
          data: { inspeccionId: inspeccion.id, itemId: r.itemId, resultado: r.resultado, observacion: r.observacion },
          include: { item: true },
        }))
      }

      // Alertas para ítems no-OK
      const conProblema = resultadosCreados.filter(r => r.resultado !== 'OK')
      if (conProblema.length) {
        await tx.alertaInspeccion.createMany({
          data: conProblema.map(r => ({
            faenaId: sesion.faenaId, inspeccionId: inspeccion.id, resultadoId: r.id, equipoId: data.equipoId,
            descripcion: r.item.descripcion + (r.observacion ? ` — ${r.observacion}` : ''),
            criticidad: r.resultado as CriticidadInspeccion,
          })),
        })
      }

      // Un hallazgo CRÍTICO detiene el equipo y genera un reporte de falla real, pendiente de validación del jefe.
      // Si ya hay un reporte crítico abierto de ese equipo, el nuevo se marca como reincidencia.
      const criticos = conProblema.filter(r => r.resultado === 'CRITICO')
      let reporteId: string | null = null
      if (criticos.length) {
        const abierto = await tx.reporteFalla.findFirst({
          where: {
            equipoId: data.equipoId, faenaId: sesion.faenaId, descripcion: { startsWith: PREFIJO_CRITICO },
            OR: [{ estado: { in: ['PENDIENTE', 'EVALUADO'] } }, { estado: 'CONVERTIDO_OT', ot: { estado: { notIn: ['CERRADA', 'ANULADA'] } } }],
          },
          orderBy: { createdAt: 'desc' }, select: { id: true },
        })
        const descripcionCriticos = criticos.map(r => r.item.descripcion + (r.observacion ? ` — ${r.observacion}` : '')).join('; ')
        const reporte = await tx.reporteFalla.create({
          data: {
            faenaId: sesion.faenaId, equipoId: data.equipoId, reportadoPorId: sesion.userId,
            descripcion: `${PREFIJO_CRITICO}: ${descripcionCriticos}`,
            riesgoSeguridad: true, prioridadSugerida: 'CRITICA', prioridad: 'CRITICA', detencionSolicitada: true,
            reincidenciaDeId: abierto?.id ?? null, inspeccionId: inspeccion.id,
          },
        })
        reporteId = reporte.id
        await tx.equipo.updateMany({ where: { id: data.equipoId, faenaId: sesion.faenaId }, data: { estado: 'DETENIDO_PENDIENTE_VALIDACION' } })
      }

      return { inspeccionId: inspeccion.id, alertas: conProblema.length, criticos: criticos.length, reporteId, repetida: false }
    }, { timeout: 20_000, maxWait: 10_000 }) // plantillas largas contra Neon pueden pasar los 5 s por defecto.then(r => { revalidatePath('/inspeccion'); revalidatePath('/fallas'); revalidatePath('/equipos'); return r })
  } catch (e) {
    // Dos envíos simultáneos con la misma clave: el segundo choca con el índice único y devuelve lo del primero.
    if (data.claveIdempotencia && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const previa = await prisma.inspeccionDiaria.findUnique({ where: { faenaId_claveIdempotencia: { faenaId: sesion.faenaId, claveIdempotencia: data.claveIdempotencia } }, select: { id: true } })
      if (previa) return resumen(previa.id)
    }
    throw e
  }
}

export async function getAlertas(soloActivas = true) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.alertaInspeccion.findMany({
    where: {
      faenaId: session.user.faenaId,
      ...(soloActivas ? { estado: { in: ['PENDIENTE', 'EN_PROCESO'] } } : {}),
    },
    include: {
      equipo: { select: { id: true, codigo: true, nombre: true } },
      inspeccion: { select: { fecha: true, turno: true, operador: { select: { nombre: true } } } },
    },
    orderBy: [
      { criticidad: 'desc' },
      { createdAt: 'desc' },
    ],
  })
}

export async function actualizarEstadoAlerta(alertaId: string, estado: 'EN_PROCESO' | 'RESUELTA' | 'DESCARTADA') {
  requireRolPermitido(await requireSesion(), ROLES_CREAR_PLAN)
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.alertaInspeccion.update({
    where: { id: alertaId, faenaId: session.user.faenaId },
    data: {
      estado,
      resueltaAt: estado === 'RESUELTA' ? new Date() : null,
    },
  })

  revalidatePath('/inspeccion')
}

export async function generarOTDesdeAlerta(alertaId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_CREAR_OT)

  const alerta = await prisma.alertaInspeccion.findUnique({ where: { id: alertaId }, include: { equipo: true } })
  if (!alerta || alerta.faenaId !== sesion.faenaId) throw new ErrorAutorizacion('Sin permisos: la alerta no existe o pertenece a otra faena')
  // Una alerta solo genera una OT: si ya la tiene, se devuelve esa.
  if (alerta.otId) return alerta.otId

  const prioridad =
    alerta.criticidad === 'CRITICO' ? 'CRITICA' :
    alerta.criticidad === 'ALERTA' ? 'ALTA' :
    alerta.criticidad === 'OBSERVACION' ? 'MEDIA' : 'BAJA'

  const otId = randomUUID()
  const creada = await prisma.$transaction(async (tx) => {
    // Candado: solo una ejecución enlaza la alerta a su OT. Si otra ya lo hizo, esta se revierte entera (sin OT duplicada).
    const enlace = await tx.alertaInspeccion.updateMany({ where: { id: alertaId, otId: null }, data: { otId, estado: 'EN_PROCESO' } })
    if (enlace.count === 0) return false
    await tx.ordenTrabajo.create({
      data: {
        id: otId, faenaId: sesion.faenaId, equipoId: alerta.equipoId, tipoMantenimiento: 'CORRECTIVO', estado: 'ABIERTA',
        prioridad: prioridad as 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA',
        descripcionFalla: `[Inspección diaria] ${alerta.descripcion}`, creadoPorId: sesion.userId,
      },
    })
    return true
  })

  revalidatePath('/inspeccion')
  revalidatePath('/ot')
  if (creada) return otId
  const actual = await prisma.alertaInspeccion.findUniqueOrThrow({ where: { id: alertaId }, select: { otId: true } })
  return actual.otId as string
}

// Solo el Jefe de Taller (de faena o central) puede autorizar que un equipo
// siga operando con una observación pendiente, en vez de quedar detenido.
export async function autorizarOperarConObservacion(equipoId: string, observacion: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])
  if (!observacion?.trim()) throw new Error('Debe indicar la observación')

  const equipo = await prisma.equipo.findUniqueOrThrow({ where: { id: equipoId }, select: { faenaId: true, estado: true } })
  requireAlcanceFaena(sesion, equipo.faenaId)

  await prisma.equipo.update({
    where: { id: equipoId },
    data: { estado: 'OPERATIVO_CON_OBSERVACION' },
  })

  await auditar({
    faenaId: equipo.faenaId,
    entidad: 'Equipo',
    entidadId: equipoId,
    accion: 'AUTORIZAR_OPERAR_CON_OBSERVACION',
    usuarioId: sesion.userId,
    valorAnterior: { estado: equipo.estado },
    valorNuevo: { estado: 'OPERATIVO_CON_OBSERVACION' },
    motivo: observacion.trim(),
  })

  revalidatePath('/equipos')
  revalidatePath(`/equipos/${equipoId}`)
}
