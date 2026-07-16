'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { CriticidadInspeccion, ResultadoItem, TurnoInspeccion } from '@prisma/client'

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

  await prisma.plantillaInspeccion.update({ where: { id }, data: { activo: false } })
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

  revalidatePath('/inspeccion')
  return { inspeccionId: inspeccion.id, alertas: conProblema.length }
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
    where: { id: alertaId },
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
