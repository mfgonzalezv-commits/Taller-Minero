'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { EstadoOT, OrigenFalla, PrioridadOT, TipoIntervencionOT, TipoMantenimiento } from '@prisma/client'
import { TRANSICIONES_OT } from '@/lib/constants'
import { calcularTasaOverhead } from './trabajadores'
import { crearChecklistDesdePauta } from './pautas'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'
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
  const sesion = await requireSesion()

  const equipo = await prisma.equipo.findUniqueOrThrow({
    where: { id: data.equipoId, faenaId: sesion.faenaId },
    select: { costoHoraDetencion: true, horometroActual: true },
  })

  // Reincidencia: ¿hubo otra OT cerrada del mismo equipo en los últimos 30
  // días o dentro de las últimas 250 horas de horómetro? Queda sugerida
  // (reincidenciaConfirmada = null) hasta que el jefe de taller la confirme.
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const otAnterior = await prisma.ordenTrabajo.findFirst({
    where: {
      equipoId: data.equipoId,
      estado: 'CERRADA',
      OR: [
        { fechaCierre: { gte: hace30Dias } },
        {
          horometroCierre: {
            gte: Number(equipo.horometroActual) - 250,
          },
        },
      ],
    },
    orderBy: { fechaCierre: 'desc' },
    select: { id: true },
  })

  const ot = await prisma.ordenTrabajo.create({
    data: {
      faenaId: sesion.faenaId,
      equipoId: data.equipoId,
      descripcionFalla: data.descripcionFalla,
      origenFalla: data.origenFalla ?? null,
      reportadaPorNombre: data.reportadaPorNombre ?? null,
      prioridad: data.prioridad ?? 'MEDIA',
      tipoMantenimiento: data.tipoMantenimiento ?? 'CORRECTIVO',
      fechaCompromiso: data.fechaCompromiso,
      creadoPorId: sesion.userId,
      costoHoraSnapshot: equipo.costoHoraDetencion,
      pautaId: data.pautaId ?? null,
      cicloPM: data.cicloPM ?? null,
      reincidente: !!otAnterior,
      reincidenciaConfirmada: otAnterior ? null : undefined,
      otOrigenId: otAnterior?.id ?? null,
      historial: {
        create: {
          estadoNuevo: 'ABIERTA',
          faenaId: sesion.faenaId,
          usuarioId: sesion.userId,
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
  const sesion = await requireSesion()

  await prisma.ordenTrabajo.update({
    where: { id: data.otId, faenaId: sesion.faenaId },
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
  const sesion = await requireSesion()

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    include: { historial: { orderBy: { fechaCambio: 'desc' }, take: 1 } },
  })
  requireAlcanceFaena(sesion, ot.faenaId)

  if (nuevoEstado === 'CERRADA') {
    requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])
  }

  const ahora = new Date()
  const inicioEstadoActual = ot.historial[0]?.fechaCambio ?? ot.fechaCreacion
  const minutos = Math.round((ahora.getTime() - inicioEstadoActual.getTime()) / 60000)
  const nuevoTiempoMin = ot.tiempoDetenidoMin + minutos
  const esReapertura = ot.estado === 'CERRADA' && nuevoEstado === 'ABIERTA'
  // El equipo vuelve a operativo y el contador de detención se congela al
  // terminar el trabajo técnico (EN_VALIDACION), no al cierre administrativo
  // (CERRADA) — pueden pasar días entre uno y otro.
  const terminaDetencion = nuevoEstado === 'EN_VALIDACION' && ot.estado !== 'EN_VALIDACION'
  const costoDetencion = terminaDetencion
    ? (Number(ot.costoHoraSnapshot) * nuevoTiempoMin) / 60
    : Number(ot.costoDetencion)

  const horometroCierre = nuevoEstado === 'CERRADA'
    ? (await prisma.equipo.findUnique({ where: { id: ot.equipoId }, select: { horometroActual: true } }))?.horometroActual
    : undefined

  const updated = await prisma.$transaction([
    prisma.historialEstadoOT.create({
      data: {
        otId,
        faenaId: sesion.faenaId,
        estadoAnterior: ot.estado,
        estadoNuevo: nuevoEstado,
        usuarioId: sesion.userId,
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
        ...(terminaDetencion ? { fechaTerminoTrabajo: ahora } : {}),
        ...(nuevoEstado === 'CERRADA' ? { fechaCierre: ahora, cerradoPorId: sesion.userId, horometroCierre } : {}),
        ...(esReapertura ? { fechaCierre: null, cerradoPorId: null } : {}),
      },
    }),
  ])

  if (terminaDetencion) {
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

// Validación técnica del Jefe de Taller — distinta del cierre administrativo.
// El equipo ya volvió a operativo al pasar a EN_VALIDACION; esto solo deja
// registrado quién revisó el trabajo técnicamente antes de que se cierre.
export async function validarTecnicamente(otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId }, select: { faenaId: true, estado: true } })
  requireAlcanceFaena(sesion, ot.faenaId)
  if (ot.estado !== 'EN_VALIDACION') throw new Error('La OT debe estar en validación técnica')

  await prisma.ordenTrabajo.update({
    where: { id: otId },
    data: { validadoTecnicamentePorId: sesion.userId, fechaValidacionTecnica: new Date() },
  })

  await auditar({
    faenaId: ot.faenaId,
    entidad: 'OrdenTrabajo',
    entidadId: otId,
    accion: 'VALIDAR_TECNICAMENTE',
    usuarioId: sesion.userId,
  })

  revalidatePath(`/ot/${otId}`)
}

// Jefe de Taller confirma o descarta la reincidencia sugerida automáticamente
// al crear la OT (mismo equipo, OT anterior cerrada hace <30 días o <250h).
export async function confirmarReincidencia(otId: string, confirmar: boolean) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId }, select: { faenaId: true } })
  requireAlcanceFaena(sesion, ot.faenaId)

  await prisma.ordenTrabajo.update({
    where: { id: otId },
    data: { reincidenciaConfirmada: confirmar },
  })

  await auditar({
    faenaId: ot.faenaId,
    entidad: 'OrdenTrabajo',
    entidadId: otId,
    accion: confirmar ? 'CONFIRMAR_REINCIDENCIA' : 'DESCARTAR_REINCIDENCIA',
    usuarioId: sesion.userId,
  })

  revalidatePath(`/ot/${otId}`)
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

// Anula una OT en vez de borrarla físicamente: conserva todo su historial,
// bitácora, repuestos y movimientos de bodega asociados para trazabilidad.
// Jefe/Planificador de faena pueden anular OT de su faena; roles con alcance
// central (ver src/lib/authz.ts) pueden anular de cualquier faena.
export async function anularOT(otId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR'])

  if (!motivo || !motivo.trim()) {
    throw new Error('Debe indicar un motivo para anular la OT')
  }

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    select: { faenaId: true, estado: true, equipoId: true },
  })
  requireAlcanceFaena(sesion, ot.faenaId)

  if (ot.estado === 'ANULADA' || ot.estado === 'CERRADA') {
    throw new Error(`No se puede anular una OT en estado ${ot.estado}`)
  }

  await prisma.$transaction([
    prisma.ordenTrabajo.update({
      where: { id: otId },
      data: {
        estado: 'ANULADA',
        motivoAnulacion: motivo.trim(),
        anuladaPorId: sesion.userId,
        anuladaAt: new Date(),
      },
    }),
    prisma.historialEstadoOT.create({
      data: {
        otId,
        faenaId: ot.faenaId,
        estadoAnterior: ot.estado,
        estadoNuevo: 'ANULADA',
        usuarioId: sesion.userId,
        observacion: motivo.trim(),
      },
    }),
  ])

  await auditar({
    faenaId: ot.faenaId,
    entidad: 'OrdenTrabajo',
    entidadId: otId,
    accion: 'ANULAR',
    usuarioId: sesion.userId,
    valorAnterior: { estado: ot.estado },
    valorNuevo: { estado: 'ANULADA' },
    motivo: motivo.trim(),
  })

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

