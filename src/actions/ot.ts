'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { EstadoOT, OrigenFalla, PrioridadOT, TipoIntervencionOT, TipoMantenimiento } from '@prisma/client'
import { ESTADOS_CON_ACCION_PROPIA, puedeTransicionarOT, validarTransicionOT } from '@/lib/maquina-ot'
import { calcularTasaOverhead } from './trabajadores'
import { crearChecklistDesdePauta } from './pautas'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar, ErrorAutorizacion, type SesionAutenticada } from '@/lib/authz'
import { ROLES_ASIGNAR_TECNICO, ROLES_BITACORA, ROLES_CREAR_OT, ROLES_GESTION_OT } from '@/lib/permisos-roles'
import { hayOTPreventivaActiva } from '@/lib/mantenimiento-guard'
import { abrirDetencion, vincularOtADetencion } from '@/lib/detencion-registro'
// Bitácora/diagnóstico: roles de gestión de la faena de la OT; un MECANICO solo si es el técnico asignado.
async function requireAccesoBitacoraOT(sesion: SesionAutenticada, otId: string) {
  requireRolPermitido(sesion, ROLES_BITACORA)
  const ot = await prisma.ordenTrabajo.findUnique({ where: { id: otId }, include: { tecnico: { select: { usuarioId: true } } } })
  if (!ot) throw new ErrorAutorizacion('Sin permisos: la OT no existe o pertenece a otra faena')
  requireAlcanceFaena(sesion, ot.faenaId)
  if (sesion.rol === 'MECANICO' && ot.tecnico?.usuarioId !== sesion.userId) {
    throw new ErrorAutorizacion('Sin permisos: el mecánico solo puede intervenir OT que tiene asignadas')
  }
  return ot
}


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
  requireRolPermitido(sesion, ROLES_CREAR_OT)

  const equipo = await prisma.equipo.findFirst({
    where: { id: data.equipoId, faenaId: sesion.faenaId },
    select: { costoHoraDetencion: true, horometroActual: true },
  })
  if (!equipo) throw new ErrorAutorizacion('Sin permisos: el equipo no existe o pertenece a otra faena')

  if ((data.tipoMantenimiento ?? 'CORRECTIVO') === 'PREVENTIVO' && (await hayOTPreventivaActiva(data.equipoId))) {
    throw new Error('Este equipo ya tiene una OT preventiva abierta (por plan o por pauta) — evita duplicados')
  }

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
  // Si el equipo ya estaba detenido (reporte o inspección), el episodio conserva su hora inicial y solo se vincula la OT.
  await abrirDetencion(prisma, { equipoId: data.equipoId, faenaId: sesion.faenaId, origen: 'OT' })
  await vincularOtADetencion(prisma, data.equipoId, ot.id)

  revalidatePath('/ot')
  revalidatePath('/dashboard')
  return ot
}

export async function asignarTecnico(otId: string, tecnicoId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_ASIGNAR_TECNICO)

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    include: { historial: { orderBy: { fechaCambio: 'desc' }, take: 1 } },
  })
  requireAlcanceFaena(sesion, ot.faenaId)
  const tecnico = await prisma.tecnico.findUnique({ where: { id: tecnicoId }, select: { faenaId: true } })
  if (!tecnico || tecnico.faenaId !== ot.faenaId) throw new ErrorAutorizacion('Sin permisos: el técnico no pertenece a la faena de la OT')
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
          faenaId: ot.faenaId,
          estadoAnterior: ot.estado,
          estadoNuevo: 'EN_DIAGNOSTICO',
          usuarioId: sesion.userId,
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
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_GESTION_OT)
  const ot = await prisma.ordenTrabajo.findUnique({ where: { id: otId }, select: { faenaId: true } })
  if (!ot) throw new ErrorAutorizacion('Sin permisos: la OT no existe o pertenece a otra faena')
  requireAlcanceFaena(sesion, ot.faenaId)

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
  const ot = await requireAccesoBitacoraOT(sesion, data.otId)

  await prisma.ordenTrabajo.update({
    where: { id: ot.id },
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

  // Gestión de la faena, o el mecánico asignado a la OT (nadie más cambia el estado de una OT).
  await requireAccesoBitacoraOT(sesion, otId)
  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    include: { historial: { orderBy: { fechaCambio: 'desc' }, take: 1 } },
  })

  if (nuevoEstado === 'CERRADA') {
    // Cierre administrativo: Jefe o Planificador, DESPUÉS de la validación técnica del Jefe.
    requireRolPermitido(sesion, ROLES_GESTION_OT)
  }
  // Doble clic / repetición: si ya está en ese estado no se vuelve a registrar nada.
  if (ot.estado === nuevoEstado) return ot
  const error = validarTransicionOT(ot.estado, nuevoEstado, { validadaTecnicamente: !!ot.fechaValidacionTecnica })
  if (error) throw new Error(error)

  const ahora = new Date()
  const inicioEstadoActual = ot.historial[0]?.fechaCambio ?? ot.fechaCreacion
  const minutos = Math.round((ahora.getTime() - inicioEstadoActual.getTime()) / 60000)
  const nuevoTiempoMin = ot.tiempoDetenidoMin + minutos
  // El equipo vuelve a operativo y el contador de detención se congela al
  // terminar el trabajo técnico (EN_VALIDACION), no al cierre administrativo
  // (CERRADA) — pueden pasar días entre uno y otro.
  const terminaDetencion = nuevoEstado === 'EN_VALIDACION'
  const costoDetencion = terminaDetencion
    ? (Number(ot.costoHoraSnapshot) * nuevoTiempoMin) / 60
    : Number(ot.costoDetencion)

  const horometroCierre = nuevoEstado === 'CERRADA'
    ? (await prisma.equipo.findUnique({ where: { id: ot.equipoId }, select: { horometroActual: true } }))?.horometroActual
    : undefined
  // Volver de validación a reparación (retrabajo) deja sin efecto la validación técnica anterior.
  const invalidaValidacion = ot.estado === 'EN_VALIDACION' && nuevoEstado === 'EN_REPARACION'

  const aplicado = await prisma.$transaction(async (tx) => {
    // Candado: el UPDATE solo aplica si la OT sigue en el estado que leímos. Si otra petición
    // la cambió en medio, no se duplica el historial.
    const cambio = await tx.ordenTrabajo.updateMany({
      where: { id: otId, estado: ot.estado },
      data: {
        estado: nuevoEstado,
        tiempoDetenidoMin: nuevoTiempoMin,
        costoDetencion,
        ...(nuevoEstado === 'EN_REPARACION' && !ot.fechaInicioTrabajo ? { fechaInicioTrabajo: ahora } : {}),
        ...(terminaDetencion ? { fechaTerminoTrabajo: ahora } : {}),
        ...(nuevoEstado === 'CERRADA' ? { fechaCierre: ahora, cerradoPorId: sesion.userId, horometroCierre } : {}),
        ...(invalidaValidacion ? { validadoTecnicamentePorId: null, fechaValidacionTecnica: null } : {}),
      },
    })
    if (cambio.count === 0) return false
    await tx.historialEstadoOT.create({
      data: { otId, faenaId: ot.faenaId, estadoAnterior: ot.estado, estadoNuevo: nuevoEstado, usuarioId: sesion.userId, observacion, tiempoEnEstadoMin: minutos },
    })
    // El equipo sigue detenido hasta la validación técnica y la liberación operacional (liberarEquipo).
    return true
  })

  if (!aplicado) {
    const actual = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
    if (actual.estado === nuevoEstado) return actual // otra petición idéntica ya lo hizo
    throw new Error('La OT cambió de estado mientras se procesaba; recarga e intenta de nuevo')
  }

  revalidatePath('/ot')
  revalidatePath(`/ot/${otId}`)
  return prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
}

// Reapertura de una OT cerrada: acción específica (no se hace con cambiarEstadoOT).
// Solo Jefe/Administrador, con motivo obligatorio y auditoría completa.
export async function reabrirOT(otId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo de la reapertura')

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId } })
  requireAlcanceFaena(sesion, ot.faenaId)
  if (ot.estado !== 'CERRADA') throw new Error('Solo se puede reabrir una OT cerrada')

  const ahora = new Date()
  await prisma.$transaction(async (tx) => {
    const cambio = await tx.ordenTrabajo.updateMany({
      where: { id: otId, estado: 'CERRADA' },
      data: { estado: 'ABIERTA', fechaCierre: null, cerradoPorId: null, validadoTecnicamentePorId: null, fechaValidacionTecnica: null, fechaTerminoTrabajo: null },
    })
    if (cambio.count === 0) throw new Error('La OT ya fue reabierta')
    await tx.historialEstadoOT.create({
      data: { otId, faenaId: ot.faenaId, estadoAnterior: 'CERRADA', estadoNuevo: 'ABIERTA', usuarioId: sesion.userId, observacion: `OT reabierta: ${motivo.trim()}`, tiempoEnEstadoMin: 0 },
    })
    await tx.equipo.update({ where: { id: ot.equipoId }, data: { estado: 'DETENIDO' } })
    await abrirDetencion(tx, { equipoId: ot.equipoId, faenaId: ot.faenaId, origen: 'REAPERTURA', otId })
    await tx.registroAuditoria.create({
      data: {
        faenaId: ot.faenaId, entidad: 'OrdenTrabajo', entidadId: otId, accion: 'REABRIR', usuarioId: sesion.userId, motivo: motivo.trim(),
        valorAnterior: { estado: 'CERRADA', fechaCierre: ot.fechaCierre, cerradoPorId: ot.cerradoPorId, fechaValidacionTecnica: ot.fechaValidacionTecnica, validadoTecnicamentePorId: ot.validadoTecnicamentePorId },
        valorNuevo: { estado: 'ABIERTA', reabiertaEn: ahora },
      },
    })
  })

  revalidatePath('/ot')
  revalidatePath(`/ot/${otId}`)
}

// Validación técnica del Jefe de Taller — distinta del cierre administrativo.
// El equipo ya volvió a operativo al pasar a EN_VALIDACION; esto solo deja
// registrado quién revisó el trabajo técnicamente antes de que se cierre.
export async function validarTecnicamente(otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'])

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({ where: { id: otId }, select: { faenaId: true, estado: true } })
  requireAlcanceFaena(sesion, ot.faenaId)
  // El Jefe de Taller Central valida solo cuando la faena no tiene Jefe de Taller local.
  if (sesion.rol === 'JEFE_TALLER_CENTRAL') {
    const jefeLocal = await prisma.usuario.count({ where: { faenaId: ot.faenaId, rol: 'JEFE_TALLER', activo: true } })
    if (jefeLocal > 0) throw new ErrorAutorizacion('Sin permisos: la faena tiene Jefe de Taller local; él valida técnicamente')
  }
  if (ot.estado !== 'EN_VALIDACION') throw new Error('La OT debe estar en validación técnica')

  // Idempotente: si ya fue validada, no se sobrescribe quién ni cuándo.
  const validada = await prisma.ordenTrabajo.updateMany({
    where: { id: otId, estado: 'EN_VALIDACION', fechaValidacionTecnica: null },
    data: { validadoTecnicamentePorId: sesion.userId, fechaValidacionTecnica: new Date() },
  })
  if (validada.count === 0) return

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
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_GESTION_OT)
  const ot = await prisma.ordenTrabajo.findUnique({ where: { id: otId }, select: { faenaId: true } })
  if (!ot) throw new ErrorAutorizacion('Sin permisos: la OT no existe o pertenece a otra faena')
  requireAlcanceFaena(sesion, ot.faenaId)

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
  const sesion = await requireSesion()
  const ot = await requireAccesoBitacoraOT(sesion, otId)
  // El estado que se indique en la bitácora debe ser una transición válida y no puede ser uno con
  // acción propia (validar, cerrar, anular). Si no lo es se RECHAZA con un mensaje: nunca se ignora en silencio.
  if (data.estado && data.estado !== ot.estado) {
    if (ESTADOS_CON_ACCION_PROPIA.includes(data.estado)) throw new Error(`La bitácora no puede pasar la OT a ${data.estado}: usa el cambio de estado de la OT`)
    if (!puedeTransicionarOT(ot.estado, data.estado)) throw new Error(`Transición no permitida: ${ot.estado} → ${data.estado}`)
  }
  const estadoAplicable = data.estado && data.estado !== ot.estado ? data.estado : undefined
  if (data.repuestos?.length) {
    const ids = [...new Set(data.repuestos.map(r => r.itemBodegaId).filter((x): x is string => !!x))]
    if (ids.length && (await prisma.itemBodega.count({ where: { id: { in: ids }, faenaId: ot.faenaId } })) !== ids.length) {
      throw new ErrorAutorizacion('Sin permisos: algún ítem de bodega no pertenece a la faena de la OT')
    }
  }
  const ahora = new Date()

  const otUpdate: Record<string, unknown> = {}
  if (estadoAplicable) {
    const minutosTransicion = Math.round((ahora.getTime() - ot.updatedAt.getTime()) / 60000)
    const nuevoTiempoMin = ot.tiempoDetenidoMin + minutosTransicion
    otUpdate.estado = estadoAplicable
    otUpdate.tiempoDetenidoMin = nuevoTiempoMin
    if (estadoAplicable === 'EN_REPARACION' && !ot.fechaInicioTrabajo) otUpdate.fechaInicioTrabajo = ahora
  }
  if (data.setEspera !== undefined) otUpdate.enEsperaRepuesto = data.setEspera
  if (data.repuestos?.length) otUpdate.enEsperaRepuesto = true

  const usuarioId = sesion.userId
  const faenaId = ot.faenaId

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
        estado: estadoAplicable ?? null,
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

  // ── Auto mano de obra desde bitácora ─────────────────────────────────────
  if (data.horaInicio && data.horaTermino && data.personal?.length) {
    const [hIni, mIni] = data.horaInicio.split(':').map(Number)
    const [hFin, mFin] = data.horaTermino.split(':').map(Number)
    const horasTotales = Math.max(0, (hFin * 60 + mFin - (hIni * 60 + mIni)) / 60)
    if (horasTotales > 0) {
      const trabajadores = await prisma.trabajador.findMany({
        where: { faenaId: ot.faenaId, nombre: { in: data.personal }, activo: true },
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
            faenaId: ot.faenaId,
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
      const tasaOverhead = await calcularTasaOverhead(ot.faenaId)
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

  // El equipo NO se libera solo al anular la OT: lo libera Jefe/Planificador de la faena (liberarEquipo).

  revalidatePath('/ot')
  revalidatePath('/dashboard')
}

export async function toggleChecklistItem(itemId: string, completado: boolean) {
  const sesion = await requireSesion()
  const existente = await prisma.checklistItemOT.findUnique({ where: { id: itemId }, select: { otId: true } })
  if (!existente) throw new ErrorAutorizacion('Sin permisos: el ítem no existe o pertenece a otra faena')
  await requireAccesoBitacoraOT(sesion, existente.otId)

  const item = await prisma.checklistItemOT.update({
    where: { id: itemId },
    data: {
      completado,
      completadoAt: completado ? new Date() : null,
      completadoPor: completado ? sesion.userId : null,
    },
    select: { otId: true },
  })

  revalidatePath(`/ot/${item.otId}`)
}

