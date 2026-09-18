'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'
import { calcularPeriodo } from '@/lib/periodo-pago'

// Prepara el Estado de Pago del periodo: solo arriendo, según la asignación
// vigente de cada equipo (Fase 2) en la faena, con descuento de detenciones.
// No incluye reparaciones, repuestos ni servicios externos — eso es la OT.
export async function prepararEstadoPago(faenaId: string, fechaBase?: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  requireAlcanceFaena(sesion, faenaId)

  const { inicio, termino } = calcularPeriodo(fechaBase ? new Date(fechaBase) : new Date())

  const existente = await prisma.estadoPago.findUnique({
    where: { faenaId_periodoInicio: { faenaId, periodoInicio: inicio } },
  })
  if (existente) throw new Error('Ya existe un Estado de Pago preparado para este periodo')

  // Asignaciones vigentes de equipos a esta faena, con tarifa/modalidad definida.
  const asignaciones = await prisma.asignacionEquipoFaena.findMany({
    where: {
      faenaId,
      tarifa: { not: null },
      modalidadArriendo: { not: null },
      fechaInicio: { lte: termino },
      OR: [{ fechaTermino: null }, { fechaTermino: { gte: inicio } }],
    },
    include: { equipo: true },
  })

  const lineas: {
    equipoId: string
    asignacionId: string
    modalidad: 'HORA' | 'DIA' | 'MES'
    tarifa: number
    cantidadUnidades: number
    montoBruto: number
    horasDetencion: number
    descuentoDetencion: number
    montoNeto: number
  }[] = []

  for (const a of asignaciones) {
    const tarifa = Number(a.tarifa)
    let cantidadUnidades = 0
    let montoBruto = 0

    if (a.modalidadArriendo === 'HORA') {
      // Horas trabajadas = delta de horómetro en el periodo (ya excluye
      // naturalmente el tiempo detenido: el horómetro no avanza detenido).
      const lecturas = await prisma.horometroKm.findMany({
        where: { equipoId: a.equipoId, fechaRegistro: { gte: inicio, lte: termino }, horometro: { not: null } },
        orderBy: { fechaRegistro: 'asc' },
      })
      if (lecturas.length >= 2) {
        cantidadUnidades = Math.max(0, Number(lecturas[lecturas.length - 1].horometro) - Number(lecturas[0].horometro))
      }
      montoBruto = cantidadUnidades * tarifa
    } else {
      // DIA o MES: se factura el periodo completo (o la fracción vigente)
      // y se descuentan proporcionalmente las horas detenidas.
      // `termino` ya incluye las 23:59:59 del último día del periodo, así que
      // la diferencia en ms entre `inicio` (00:00:00) y `termino` redondeada
      // a días YA da el conteo correcto de días calendario — sumar +1 lo
      // infla en un día (bug encontrado y corregido en la verificación final
      // con datos de prueba: para 26-ago→25-sep daba 32 días en vez de 31).
      const diasPeriodo = Math.round((termino.getTime() - inicio.getTime()) / 86_400_000)
      const diasVigentes = Math.min(
        diasPeriodo,
        Math.round(((a.fechaTermino ?? termino).getTime() - Math.max(a.fechaInicio.getTime(), inicio.getTime())) / 86_400_000)
      )
      cantidadUnidades = a.modalidadArriendo === 'MES' ? diasVigentes / 30 : diasVigentes
      montoBruto = a.modalidadArriendo === 'MES' ? tarifa * (diasVigentes / 30) : tarifa * diasVigentes
    }

    // Horas de detención reales EN ESTE PERIODO (de OT del equipo cuya
    // ventana de detención se solapa con [inicio, termino]). Antes esto
    // sumaba tiempoDetenidoMin de TODA OT histórica del equipo sin acotar
    // por periodo, inflando el descuento acumulativamente mes a mes — bug
    // corregido en el control final antes de desplegar.
    const ots = await prisma.ordenTrabajo.findMany({
      where: {
        equipoId: a.equipoId,
        estado: { not: 'ANULADA' },
        fechaCreacion: { lte: termino },
        OR: [{ fechaTerminoTrabajo: null }, { fechaTerminoTrabajo: { gte: inicio } }],
      },
      select: { tiempoDetenidoMin: true },
    })
    const horasDetencion = ots.reduce((acc, o) => acc + o.tiempoDetenidoMin, 0) / 60

    let descuentoDetencion = 0
    if (a.reglaDescuentoDetencion && a.modalidadArriendo !== 'HORA') {
      // Regla simple: "100%" = descuenta el equivalente proporcional de
      // arriendo por las horas detenidas; sin regla configurada, no se
      // descuenta (queda para ajuste manual con motivo).
      const porcentaje = parseFloat(a.reglaDescuentoDetencion.replace('%', '')) || 0
      const tarifaHoraEquivalente = a.modalidadArriendo === 'MES' ? tarifa / (30 * 24) : tarifa / 24
      descuentoDetencion = horasDetencion * tarifaHoraEquivalente * (porcentaje / 100)
    }

    const montoNeto = Math.max(0, montoBruto - descuentoDetencion)

    lineas.push({
      equipoId: a.equipoId,
      asignacionId: a.id,
      modalidad: a.modalidadArriendo!,
      tarifa,
      cantidadUnidades,
      montoBruto,
      horasDetencion,
      descuentoDetencion,
      montoNeto,
    })
  }

  const totalBruto = lineas.reduce((acc, l) => acc + l.montoBruto, 0)
  const totalDescuentos = lineas.reduce((acc, l) => acc + l.descuentoDetencion, 0)
  const totalNeto = lineas.reduce((acc, l) => acc + l.montoNeto, 0)

  const estadoPago = await prisma.estadoPago.create({
    data: {
      faenaId,
      periodoInicio: inicio,
      periodoTermino: termino,
      estado: 'PREPARADO',
      preparadoPorId: sesion.userId,
      totalBruto,
      totalDescuentos,
      totalNeto,
      lineas: { create: lineas },
    },
    include: { lineas: true },
  })

  await auditar({
    faenaId, entidad: 'EstadoPago', entidadId: estadoPago.id, accion: 'PREPARAR',
    usuarioId: sesion.userId, valorNuevo: { totalNeto },
  })

  revalidatePath('/arriendos')
  return estadoPago.id
}

export async function agregarAjusteManual(lineaId: string, monto: number, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  if (!motivo?.trim()) throw new Error('Debe justificar el ajuste')

  const linea = await prisma.estadoPagoLinea.findUniqueOrThrow({
    where: { id: lineaId },
    include: { estadoPago: true },
  })
  requireAlcanceFaena(sesion, linea.estadoPago.faenaId)
  if (linea.estadoPago.estado === 'APROBADO') throw new Error('No se puede ajustar un Estado de Pago ya aprobado')

  await prisma.$transaction([
    prisma.ajusteEstadoPagoLinea.create({
      data: { lineaId, monto, motivo: motivo.trim(), usuarioId: sesion.userId },
    }),
    prisma.estadoPagoLinea.update({
      where: { id: lineaId },
      data: { montoNeto: { increment: monto } },
    }),
    prisma.estadoPago.update({
      where: { id: linea.estadoPagoId },
      data: { totalAjustes: { increment: monto }, totalNeto: { increment: monto } },
    }),
  ])

  await auditar({
    faenaId: linea.estadoPago.faenaId, entidad: 'EstadoPagoLinea', entidadId: lineaId,
    accion: 'AJUSTE_MANUAL', usuarioId: sesion.userId, valorNuevo: { monto }, motivo: motivo.trim(),
  })

  revalidatePath('/arriendos')
}

// Solo Gerencia aprueba (o rechaza) el Estado de Pago.
export async function aprobarEstadoPago(estadoPagoId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'GERENCIA'])

  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId } })
  requireAlcanceFaena(sesion, ep.faenaId)

  await prisma.estadoPago.update({
    where: { id: estadoPagoId },
    data: { estado: 'APROBADO', aprobadoPorId: sesion.userId, fechaAprobacion: new Date() },
  })

  await auditar({
    faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: estadoPagoId,
    accion: 'APROBAR', usuarioId: sesion.userId,
  })

  revalidatePath('/arriendos')
}

export async function rechazarEstadoPago(estadoPagoId: string, motivo: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'GERENCIA'])
  if (!motivo?.trim()) throw new Error('Debe indicar el motivo del rechazo')

  const ep = await prisma.estadoPago.findUniqueOrThrow({ where: { id: estadoPagoId } })
  requireAlcanceFaena(sesion, ep.faenaId)

  await prisma.estadoPago.update({
    where: { id: estadoPagoId },
    data: { estado: 'RECHAZADO', motivoRechazo: motivo.trim() },
  })

  await auditar({
    faenaId: ep.faenaId, entidad: 'EstadoPago', entidadId: estadoPagoId,
    accion: 'RECHAZAR', usuarioId: sesion.userId, motivo: motivo.trim(),
  })

  revalidatePath('/arriendos')
}

export async function getEstadosPago() {
  const sesion = await requireSesion()
  return prisma.estadoPago.findMany({
    where: { faenaId: sesion.faenaId },
    include: {
      lineas: { include: { equipo: { select: { codigo: true, nombre: true } } } },
      preparadoPor: { select: { nombre: true } },
      aprobadoPor: { select: { nombre: true } },
    },
    orderBy: { periodoInicio: 'desc' },
  })
}

export async function getEstadoPagoDetalle(id: string) {
  const sesion = await requireSesion()
  const ep = await prisma.estadoPago.findUniqueOrThrow({
    where: { id },
    include: {
      faena: { select: { nombre: true, codigo: true } },
      preparadoPor: { select: { nombre: true } },
      aprobadoPor: { select: { nombre: true } },
      lineas: {
        include: {
          equipo: { select: { codigo: true, nombre: true } },
          ajustes: { include: { usuario: { select: { nombre: true } } } },
        },
      },
    },
  })
  requireAlcanceFaena(sesion, ep.faenaId)
  return ep
}
