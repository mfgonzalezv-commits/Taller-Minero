'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { EstadoOT, OrigenFalla, PrioridadOT, TipoIntervencionOT, TipoMantenimiento } from '@prisma/client'
import { TRANSICIONES_OT } from '@/lib/constants'
import { calcularTasaOverhead } from './trabajadores'
import { crearChecklistDesdePauta } from './pautas'
// TRANSICIONES_OT se mantiene solo para los botones rápidos del header — la bitácora no tiene restricciones

export async function getOTs(filtros?: { estado?: EstadoOT; equipoId?: string }) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.ordenTrabajo.findMany({
    where: {
      faenaId: session.user.faenaId,
      ...(filtros?.estado && { estado: filtros.estado }),
      ...(filtros?.equipoId && { equipoId: filtros.equipoId }),
    },
    include: {
      equipo: { select: { id: true, codigo: true, nombre: true, tipo: true } },
      responsable: { select: { id: true, nombre: true } },
      tecnico: { include: { usuario: { select: { nombre: true } } } },
    },
    orderBy: [{ prioridad: 'asc' }, { fechaCreacion: 'desc' }],
  })
}

export async function getOTById(id: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.ordenTrabajo.findFirst({
    where: { id, faenaId: session.user.faenaId },
    include: {
      equipo: true,
      responsable: { select: { id: true, nombre: true, rol: true } },
      tecnico: { include: { usuario: { select: { id: true, nombre: true } } } },
      creadoPor: { select: { id: true, nombre: true } },
      historial: {
        include: { usuario: { select: { nombre: true } } },
        orderBy: { fechaCambio: 'asc' },
      },
    },
  })
}

export async function crearOT(data: {
  equipoId: string
  descripcionFalla: string
  prioridad?: PrioridadOT
  tipoMantenimiento?: TipoMantenimiento
  fechaCompromiso?: Date
  origenFalla?: OrigenFalla
  reportadaPorNombre?: string
  pautaId?: string
  cicloPM?: number
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const equipo = await prisma.equipo.findUnique({
    where: { id: data.equipoId },
    select: { costoHoraDetencion: true },
  })

  const ot = await prisma.ordenTrabajo.create({
    data: {
      faenaId: session.user.faenaId,
      equipoId: data.equipoId,
      descripcionFalla: data.descripcionFalla,
      origenFalla: data.origenFalla ?? null,
      reportadaPorNombre: data.reportadaPorNombre ?? null,
      prioridad: data.prioridad ?? 'MEDIA',
      tipoMantenimiento: data.tipoMantenimiento ?? 'CORRECTIVO',
      fechaCompromiso: data.fechaCompromiso,
      creadoPorId: session.user.id,
      costoHoraSnapshot: equipo?.costoHoraDetencion ?? 0,
      pautaId: data.pautaId ?? null,
      cicloPM: data.cicloPM ?? null,
      historial: {
        create: {
          estadoNuevo: 'ABIERTA',
          faenaId: session.user.faenaId,
          usuarioId: session.user.id,
          observacion: 'OT creada',
        },
      },
    },
  })

  if (data.pautaId && data.cicloPM) {
    await crearChecklistDesdePauta(ot.id, data.pautaId, data.cicloPM)
  }

  await prisma.equipo.update({
    where: { id: data.equipoId },
    data: { estado: 'DETENIDO' },
  })

  revalidatePath('/ot')
  revalidatePath('/dashboard')
  return ot
}

export async function asignarTecnico(otId: string, tecnicoId: string) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    include: { historial: { orderBy: { fechaCambio: 'desc' }, take: 1 } },
  })
  const iniciarDiagnostico = ot.estado === 'ABIERTA' || ot.estado === 'PROGRAMADA'
  const ahora = new Date()
  const inicioEstadoActual = ot.historial[0]?.fechaCambio ?? ot.fechaCreacion

  await prisma.$transaction([
    prisma.ordenTrabajo.update({
      where: { id: otId },
      data: {
        tecnicoAsignadoId: tecnicoId,
        ...(iniciarDiagnostico ? { estado: 'EN_DIAGNOSTICO' } : {}),
      },
    }),
    ...(iniciarDiagnostico ? [
      prisma.historialEstadoOT.create({
        data: {
          otId,
          faenaId: session.user.faenaId,
          estadoAnterior: ot.estado,
          estadoNuevo: 'EN_DIAGNOSTICO',
          usuarioId: session.user.id,
          observacion: 'Mecánico asignado — inicio diagnóstico',
          tiempoEnEstadoMin: Math.round((ahora.getTime() - inicioEstadoActual.getTime()) / 60000),
        },
      }),
    ] : []),
  ])

  revalidatePath(`/ot/${otId}`)
}

export async function getTecnicosDisponibles() {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  return prisma.tecnico.findMany({
    where: { faenaId: session.user.faenaId, disponible: true },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { usuario: { nombre: 'asc' } },
  })
}

export async function actualizarManoObra(otId: string, costoManoObra: number) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.ordenTrabajo.update({
    where: { id: otId },
    data: { costoManoObra },
  })

  revalidatePath(`/ot/${otId}`)
}

export async function actualizarDiagnostico(data: {
  otId: string
  diagnostico?: string
  trabajoEjecutado?: string
  fechaInicioTrabajo?: string
  fechaTerminoTrabajo?: string
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.ordenTrabajo.update({
    where: { id: data.otId },
    data: {
      diagnostico: data.diagnostico || null,
      trabajoEjecutado: data.trabajoEjecutado || null,
      fechaInicioTrabajo: data.fechaInicioTrabajo ? new Date(data.fechaInicioTrabajo) : null,
      fechaTerminoTrabajo: data.fechaTerminoTrabajo ? new Date(data.fechaTerminoTrabajo) : null,
    },
  })

  revalidatePath(`/ot/${data.otId}`)
}

export async function cambiarEstadoOT(
  otId: string,
  nuevoEstado: EstadoOT,
  observacion?: string
) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    include: { historial: { orderBy: { fechaCambio: 'desc' }, take: 1 } },
  })

  const ahora = new Date()
  const inicioEstadoActual = ot.historial[0]?.fechaCambio ?? ot.fechaCreacion
  const minutos = Math.round((ahora.getTime() - inicioEstadoActual.getTime()) / 60000)
  const nuevoTiempoMin = ot.tiempoDetenidoMin + minutos
  const esReapertura = ot.estado === 'CERRADA' && nuevoEstado === 'ABIERTA'
  const costoDetencion = nuevoEstado === 'CERRADA'
    ? (Number(ot.costoHoraSnapshot) * nuevoTiempoMin) / 60
    : Number(ot.costoDetencion)

  const updated = await prisma.$transaction([
    prisma.historialEstadoOT.create({
      data: {
        otId,
        faenaId: session.user.faenaId,
        estadoAnterior: ot.estado,
        estadoNuevo: nuevoEstado,
        usuarioId: session.user.id,
        observacion: observacion ?? (esReapertura ? 'OT reabierta' : undefined),
        tiempoEnEstadoMin: minutos,
      },
    }),
    prisma.ordenTrabajo.update({
      where: { id: otId },
      data: {
        estado: nuevoEstado,
        tiempoDetenidoMin: nuevoTiempoMin,
        costoDetencion,
        ...(nuevoEstado === 'EN_REPARACION' && !ot.fechaInicioTrabajo
          ? { fechaInicioTrabajo: ahora }
          : {}),
        ...(nuevoEstado === 'CERRADA' ? { fechaCierre: ahora } : {}),
        ...(esReapertura ? { fechaCierre: null } : {}),
      },
    }),
  ])

  if (nuevoEstado === 'CERRADA') {
    await prisma.equipo.update({
      where: { id: ot.equipoId },
      data: { estado: 'OPERATIVO' },
    })
  }
  if (esReapertura) {
    await prisma.equipo.update({
      where: { id: ot.equipoId },
      data: { estado: 'DETENIDO' },
    })
  }

  revalidatePath('/ot')
  revalidatePath(`/ot/${otId}`)
  return updated[1]
}

export async function actualizarOrigenFalla(otId: string, data: {
  origenFalla?: OrigenFalla | null
  reportadaPorNombre?: string | null
}) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.ordenTrabajo.update({
    where: { id: otId },
    data: {
      origenFalla: data.origenFalla ?? null,
      reportadaPorNombre: data.reportadaPorNombre ?? null,
    },
  })

  revalidatePath(`/ot/${otId}`)
}

export async function agregarBitacora(otId: string, data: {
  descripcion: string
  fechaHora?: string
  horaInicio?: string
  horaTermino?: string
  personal?: string[]
  tipoIntervencion?: TipoIntervencionOT
  notaRepuesto?: string
  estado?: EstadoOT
  setEspera?: boolean
  repuestos?: { descripcion: string; cantidad: number; unidad: string; itemBodegaId?: string }[]
}) {
  const session = await auth()
  if (!session?.user?.faenaId || !session?.user?.id) throw new Error('Sin sesión')

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
  const ahora = new Date()

  const otUpdate: Record<string, unknown> = {}
  if (data.estado && data.estado !== ot.estado) {
    const minutosTransicion = Math.round((ahora.getTime() - ot.updatedAt.getTime()) / 60000)
    const nuevoTiempoMin = ot.tiempoDetenidoMin + minutosTransicion
    otUpdate.estado = data.estado
    otUpdate.tiempoDetenidoMin = nuevoTiempoMin
    if (data.estado === 'EN_REPARACION' && !ot.fechaInicioTrabajo) otUpdate.fechaInicioTrabajo = ahora
    if (data.estado === 'CERRADA') {
      otUpdate.fechaCierre = ahora
      otUpdate.costoDetencion = (Number(ot.costoHoraSnapshot) * nuevoTiempoMin) / 60
    }
  }
  if (data.setEspera !== undefined) otUpdate.enEsperaRepuesto = data.setEspera
  if (data.repuestos?.length) otUpdate.enEsperaRepuesto = true

  const usuarioId = session.user!.id
  const faenaId = session.user!.faenaId!

  // Usamos transacción callback para obtener el ID de la entrada creada
  await prisma.$transaction(async (tx) => {
    const entrada = await tx.bitacoraOT.create({
      data: {
        otId,
        descripcion: data.descripcion,
        horaInicio: data.horaInicio ?? null,
        horaTermino: data.horaTermino ?? null,
        personal: data.personal ?? [],
        tipoIntervencion: data.tipoIntervencion ?? null,
        notaRepuesto: data.notaRepuesto ?? null,
        estado: data.estado ?? null,
        setEspera: data.repuestos?.length ? true : (data.setEspera ?? null),
        usuarioId,
        ...(data.fechaHora ? { fechaHora: new Date(data.fechaHora + 'T12:00:00') } : {}),
      },
    })

    if (data.repuestos?.length) {
      for (const r of data.repuestos) {
        await tx.repuestoOT.create({
          data: {
            otId,
            faenaId,
            descripcion: r.descripcion,
            cantidad: r.cantidad,
            unidad: r.unidad,
            precioUnit: 0,
            total: 0,
            estadoSolicitud: 'SOLICITADO',
            registradoById: usuarioId,
            itemBodegaId: r.itemBodegaId ?? null,
            bitacoraId: entrada.id,
          },
        })
      }
    }

    if (Object.keys(otUpdate).length > 0) {
      await tx.ordenTrabajo.update({ where: { id: otId }, data: otUpdate })
    }
  })

  if (data.estado === 'CERRADA') {
    await prisma.equipo.update({ where: { id: ot.equipoId }, data: { estado: 'OPERATIVO' } })
  }

  // ── Auto mano de obra desde bitácora ─────────────────────────────────────
  if (data.horaInicio && data.horaTermino && data.personal?.length) {
    const [hIni, mIni] = data.horaInicio.split(':').map(Number)
    const [hFin, mFin] = data.horaTermino.split(':').map(Number)
    const horasTotales = Math.max(0, (hFin * 60 + mFin - (hIni * 60 + mIni)) / 60)
    if (horasTotales > 0) {
      const trabajadores = await prisma.trabajador.findMany({
        where: { faenaId: session.user.faenaId!, nombre: { in: data.personal }, activo: true },
        select: { id: true, nombre: true, sueldoBruto: true, horasMensuales: true, tasaLeyesSociales: true },
      })
      for (const nombre of data.personal) {
        const t = trabajadores.find(w => w.nombre === nombre)
        const tarifaNormal = t && t.horasMensuales > 0
          ? Math.round((Number(t.sueldoBruto) * (1 + Number(t.tasaLeyesSociales))) / t.horasMensuales)
          : 0
        await prisma.manoObraOT.create({
          data: {
            otId,
            faenaId: session.user.faenaId!,
            nombre,
            trabajadorId: t?.id ?? null,
            horasNormales: horasTotales,
            horasExtra: 0,
            tarifaNormal,
            tarifaExtra: 0,
            total: horasTotales * tarifaNormal,
          },
        })
      }
      const entradas = await prisma.manoObraOT.findMany({
        where: { otId },
        select: { total: true, horasNormales: true, horasExtra: true },
      })
      const costoManoObra = entradas.reduce((a, e) => a + Number(e.total), 0)
      const totalHoras = entradas.reduce((a, e) => a + Number(e.horasNormales) + Number(e.horasExtra), 0)
      const tasaOverhead = await calcularTasaOverhead(session.user.faenaId!)
      const costoOverhead = Math.round(totalHoras * tasaOverhead)
      await prisma.ordenTrabajo.update({ where: { id: otId }, data: { costoManoObra, costoOverhead } })
    }
  }

  revalidatePath('/ot')
  revalidatePath(`/ot/${otId}`)
}

export async function eliminarOT(otId: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    select: { equipoId: true, faenaId: true },
  })
  if (ot.faenaId !== session.user.faenaId) throw new Error('Sin permisos')

  // Borrar relaciones en orden para evitar FK violations
  const srIds = (await prisma.solicitudRepuesto.findMany({ where: { otId }, select: { id: true } })).map(s => s.id)
  if (srIds.length > 0) {
    await prisma.historialSR.deleteMany({ where: { srId: { in: srIds } } })
    // ItemSolicitudRepuesto tiene onDelete: Cascade, se borra con SolicitudRepuesto
  }
  await prisma.solicitudRepuesto.deleteMany({ where: { otId } })
  await prisma.movimientoBodega.deleteMany({ where: { otId } })
  await prisma.repuestoOT.deleteMany({ where: { otId } })
  await prisma.manoObraOT.deleteMany({ where: { otId } })
  await prisma.checklistItemOT.deleteMany({ where: { otId } })
  await prisma.bitacoraOT.deleteMany({ where: { otId } })
  await prisma.historialEstadoOT.deleteMany({ where: { otId } })
  await prisma.ordenTrabajo.delete({ where: { id: otId } })

  await prisma.equipo.update({ where: { id: ot.equipoId }, data: { estado: 'OPERATIVO' } })

  revalidatePath('/ot')
  revalidatePath('/dashboard')
}

export async function toggleChecklistItem(itemId: string, completado: boolean) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Sin sesión')

  const item = await prisma.checklistItemOT.update({
    where: { id: itemId },
    data: {
      completado,
      completadoAt: completado ? new Date() : null,
      completadoPor: completado ? session.user.id : null,
    },
    select: { otId: true },
  })

  revalidatePath(`/ot/${item.otId}`)
}

