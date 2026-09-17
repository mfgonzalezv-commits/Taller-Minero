'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireSesion, requireRolPermitido, requireAlcanceFaena, auditar } from '@/lib/authz'
import { encolarCorreo } from '@/lib/correo'

// Informe operacional del día — flota, OT, detenciones, mantenimiento,
// repuestos, compras, reincidencias. Se calcula en vivo (no se guarda un
// snapshot histórico todavía).
export async function getInformeDiario(faenaId: string) {
  const sesion = await requireSesion()
  requireAlcanceFaena(sesion, faenaId)

  const hoy = new Date()
  const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  const [equipos, otsAbiertas, otsCerradasHoy, otsAtrasadas, itemsCriticos, comprasDirectasMes, reincidenciasPendientes] = await Promise.all([
    prisma.equipo.findMany({ where: { faenaId, activo: true }, select: { estado: true } }),
    prisma.ordenTrabajo.findMany({
      where: { faenaId, estado: { notIn: ['CERRADA', 'ANULADA'] } },
      select: { id: true, numeroOt: true, prioridad: true, estado: true, fechaCompromiso: true, equipo: { select: { codigo: true } } },
    }),
    prisma.ordenTrabajo.count({ where: { faenaId, estado: 'CERRADA', fechaCierre: { gte: inicioDia } } }),
    prisma.ordenTrabajo.count({
      where: { faenaId, estado: { notIn: ['CERRADA', 'ANULADA'] }, fechaCompromiso: { lt: hoy } },
    }),
    prisma.itemBodega.findMany({ where: { faenaId, activo: true } }),
    prisma.solicitudRepuesto.count({ where: { faenaId, esCompraDirecta: true, createdAt: { gte: inicioDia } } }),
    prisma.ordenTrabajo.count({ where: { faenaId, reincidente: true, reincidenciaConfirmada: null } }),
  ])

  const bajoStock = itemsCriticos.filter(i => Number(i.stockActual) <= Number(i.stockMinimo)).length

  return {
    fecha: hoy.toISOString(),
    flota: {
      total: equipos.length,
      operativos: equipos.filter(e => e.estado === 'OPERATIVO' || e.estado === 'OPERATIVO_CON_OBSERVACION').length,
      detenidos: equipos.filter(e => e.estado === 'DETENIDO' || e.estado === 'DETENIDO_PENDIENTE_VALIDACION').length,
    },
    ot: {
      abiertas: otsAbiertas.length,
      cerradasHoy: otsCerradasHoy,
      atrasadas: otsAtrasadas,
      reincidenciasPendientes,
      lista: otsAbiertas.slice(0, 15),
    },
    bodega: { itemsBajoStock: bajoStock, comprasDirectasEsteMes: comprasDirectasMes },
  }
}

type InformeDiario = Awaited<ReturnType<typeof getInformeDiario>>

function formatearInformeDiario(faenaNombre: string, informe: InformeDiario): string {
  return [
    `Informe operacional diario — ${faenaNombre} — ${new Date(informe.fecha).toLocaleDateString('es-CL')}`,
    '',
    `Flota: ${informe.flota.operativos}/${informe.flota.total} operativa, ${informe.flota.detenidos} detenidos`,
    `OT: ${informe.ot.abiertas} abiertas, ${informe.ot.cerradasHoy} cerradas hoy, ${informe.ot.atrasadas} atrasadas`,
    `Reincidencias pendientes de confirmar: ${informe.ot.reincidenciasPendientes}`,
    `Bodega: ${informe.bodega.itemsBajoStock} ítems bajo stock mínimo, ${informe.bodega.comprasDirectasEsteMes} compras directas este mes`,
  ].join('\n')
}

// Envía (encola) el informe diario a los destinatarios configurados para la
// faena y para central.
export async function enviarInformeDiario(faenaId: string) {
  const sesion = await requireSesion()
  requireAlcanceFaena(sesion, faenaId)

  const [faena, informe, destinatarios] = await Promise.all([
    prisma.faena.findUniqueOrThrow({ where: { id: faenaId }, select: { nombre: true } }),
    getInformeDiario(faenaId),
    prisma.destinatarioInforme.findMany({
      where: { tipo: 'DIARIO', activo: true, OR: [{ faenaId }, { faenaId: null }] },
    }),
  ])

  const correo = await encolarCorreo({
    faenaId,
    tipo: 'INFORME_DIARIO',
    destinatarios: destinatarios.map(d => d.email),
    asunto: `Informe diario — ${faena.nombre} — ${new Date().toLocaleDateString('es-CL')}`,
    cuerpo: formatearInformeDiario(faena.nombre, informe),
  })

  revalidatePath('/informes')
  return correo.id
}

// ─── Compromisos de reunión ──────────────────────────────────────────────────

export async function crearCompromiso(data: {
  faenaId: string
  descripcion: string
  responsableId?: string
  fechaLimite: string
  origenReunion?: string
}) {
  const sesion = await requireSesion()
  requireAlcanceFaena(sesion, data.faenaId)

  const compromiso = await prisma.compromiso.create({
    data: {
      faenaId: data.faenaId,
      descripcion: data.descripcion,
      responsableId: data.responsableId ?? null,
      fechaLimite: new Date(data.fechaLimite),
      origenReunion: data.origenReunion ?? null,
      creadoPorId: sesion.userId,
    },
  })

  revalidatePath('/informes')
  return compromiso.id
}

export async function marcarCompromisoCumplido(compromisoId: string) {
  const sesion = await requireSesion()
  const c = await prisma.compromiso.findUniqueOrThrow({ where: { id: compromisoId } })
  requireAlcanceFaena(sesion, c.faenaId)

  await prisma.compromiso.update({
    where: { id: compromisoId },
    data: { estado: 'CUMPLIDO', fechaCumplido: new Date() },
  })

  await auditar({
    faenaId: c.faenaId, entidad: 'Compromiso', entidadId: compromisoId,
    accion: 'MARCAR_CUMPLIDO', usuarioId: sesion.userId,
  })

  revalidatePath('/informes')
}

export async function getCompromisos(faenaId: string) {
  const sesion = await requireSesion()
  requireAlcanceFaena(sesion, faenaId)

  // Marca automáticamente como ATRASADO lo que venció sin cumplirse.
  await prisma.compromiso.updateMany({
    where: { faenaId, estado: 'PENDIENTE', fechaLimite: { lt: new Date() } },
    data: { estado: 'ATRASADO' },
  })

  return prisma.compromiso.findMany({
    where: { faenaId },
    include: { responsable: { select: { nombre: true } }, creadoPor: { select: { nombre: true } } },
    orderBy: [{ estado: 'asc' }, { fechaLimite: 'asc' }],
  })
}

// ─── Destinatarios configurables ─────────────────────────────────────────────

export async function getDestinatarios(faenaId: string | null) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])
  if (faenaId) requireAlcanceFaena(sesion, faenaId)

  return prisma.destinatarioInforme.findMany({ where: { faenaId }, orderBy: { tipo: 'asc' } })
}

export async function agregarDestinatario(faenaId: string | null, tipo: string, email: string) {
  const sesion = await requireSesion()
  // Central (faenaId null) solo la configuran roles centrales.
  if (faenaId === null) {
    requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  } else {
    requireAlcanceFaena(sesion, faenaId)
    requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'])
  }

  await prisma.destinatarioInforme.create({ data: { faenaId, tipo, email } })
  revalidatePath('/informes')
}

export async function quitarDestinatario(id: string) {
  const sesion = await requireSesion()
  const d = await prisma.destinatarioInforme.findUniqueOrThrow({ where: { id } })
  if (d.faenaId === null) {
    requireRolPermitido(sesion, ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'])
  } else {
    requireAlcanceFaena(sesion, d.faenaId)
  }

  await prisma.destinatarioInforme.update({ where: { id }, data: { activo: false } })
  revalidatePath('/informes')
}
