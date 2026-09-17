'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { CriticidadInspeccion, ResultadoItem, TurnoInspeccion } from '@prisma/client'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'

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
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const inspeccion = await prisma.inspeccionDiaria.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId,
      plantillaId: data.plantillaId,
      turno: data.turno,
      operadorId: session.user.id,
      completada: true,
      observacion: data.observacion,
    },
  })

  // Crear resultados
  const resultadosCreados = await Promise.all(
    data.resultados.map(r =>
      prisma.resultadoInspeccion.create({
        data: {
          inspeccionId: inspeccion.id,
          itemId: r.itemId,
          resultado: r.resultado,
          observacion: r.observacion,
        },
        include: { item: true },
      })
    )
  )

  // Crear alertas para ítems no-OK
  const conProblema = resultadosCreados.filter(r => r.resultado !== 'OK')
  if (conProblema.length) {
    await prisma.alertaInspeccion.createMany({
      data: conProblema.map(r => ({
        faenaId: session.user!.faenaId!,
        inspeccionId: inspeccion.id,
        resultadoId: r.id,
        equipoId: data.equipoId,
        descripcion: r.item.descripcion + (r.observacion ? ` — ${r.observacion}` : ''),
        criticidad: r.resultado as CriticidadInspeccion,
      })),
    })
  }

  // Un hallazgo CRÍTICO detiene el equipo de inmediato y genera un reporte
  // de falla real (no solo una alerta) — queda pendiente de validación del
  // jefe de taller, igual que una detención pedida desde /fallas.
  const criticos = conProblema.filter(r => r.resultado === 'CRITICO')
  if (criticos.length) {
    const descripcionCriticos = criticos.map(r => r.item.descripcion + (r.observacion ? ` — ${r.observacion}` : '')).join('; ')
    await prisma.reporteFalla.create({
      data: {
        faenaId: session.user!.faenaId!,
        equipoId: data.equipoId,
        reportadoPorId: session.user!.id!,
        descripcion: `Hallazgo crítico en inspección diaria: ${descripcionCriticos}`,
        riesgoSeguridad: true,
        prioridadSugerida: 'CRITICA',
        prioridad: 'CRITICA',
        detencionSolicitada: true,
      },
    })
    await prisma.equipo.update({
      where: { id: data.equipoId },
      data: { estado: 'DETENIDO_PENDIENTE_VALIDACION' },
    })
  }

  revalidatePath('/inspeccion')
  revalidatePath('/fallas')
  revalidatePath('/equipos')
  return { inspeccionId: inspeccion.id, alertas: conProblema.length, criticos: criticos.length }
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

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
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const alerta = await prisma.alertaInspeccion.findUniqueOrThrow({
    where: { id: alertaId },
    include: {
      equipo: true,
      inspeccion: { include: { operador: { select: { nombre: true } } } },
    },
  })
  if (alerta.faenaId !== session.user.faenaId) throw new Error('Sin permisos: la alerta pertenece a otra faena')

  const prioridad =
    alerta.criticidad === 'CRITICO' ? 'CRITICA' :
    alerta.criticidad === 'ALERTA' ? 'ALTA' :
    alerta.criticidad === 'OBSERVACION' ? 'MEDIA' : 'BAJA'

  const ot = await prisma.ordenTrabajo.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: alerta.equipoId,
      tipoMantenimiento: 'CORRECTIVO',
      estado: 'ABIERTA',
      prioridad: prioridad as 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA',
      descripcionFalla: `[Inspección diaria] ${alerta.descripcion}`,
      creadoPorId: session.user.id,
    },
  })

  await prisma.alertaInspeccion.update({
    where: { id: alertaId },
    data: { otId: ot.id, estado: 'EN_PROCESO' },
  })

  revalidatePath('/inspeccion')
  revalidatePath('/ot')
  return ot.id
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
