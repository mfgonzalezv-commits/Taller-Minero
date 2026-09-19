'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { calcularTasaOverhead } from './trabajadores'
import { requireSesion, requireAlcanceFaena, requireRolPermitido, ErrorAutorizacion } from '@/lib/authz'
import { ROLES_GESTION_OT } from '@/lib/permisos-roles'

async function recalcularCostoManoObra(otId: string, faenaId: string) {
  const entradas = await prisma.manoObraOT.findMany({
    where: { otId },
    select: { total: true, horasNormales: true, horasExtra: true },
  })
  const costoManoObra = entradas.reduce((acc, e) => acc + Number(e.total), 0)
  const totalHoras = entradas.reduce(
    (acc, e) => acc + Number(e.horasNormales) + Number(e.horasExtra), 0
  )
  const tasaOverhead = await calcularTasaOverhead(faenaId)
  const costoOverhead = Math.round(totalHoras * tasaOverhead)
  await prisma.ordenTrabajo.update({
    where: { id: otId },
    data: { costoManoObra, costoOverhead },
  })
}

export async function agregarManoObra(data: {
  otId: string
  nombre: string
  tecnicoId?: string
  trabajadorId?: string
  horasNormales: number
  horasExtra: number
  tarifaNormal: number
  tarifaExtra: number
}) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_GESTION_OT)

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: data.otId },
    select: { faenaId: true },
  })
  requireAlcanceFaena(sesion, ot.faenaId)
  if (data.trabajadorId) {
    const t = await prisma.trabajador.findUnique({ where: { id: data.trabajadorId }, select: { faenaId: true } })
    if (!t || t.faenaId !== ot.faenaId) throw new ErrorAutorizacion('Sin permisos: el trabajador no pertenece a la faena de la OT')
  }
  if (data.tecnicoId) {
    const t = await prisma.tecnico.findUnique({ where: { id: data.tecnicoId }, select: { faenaId: true } })
    if (!t || t.faenaId !== ot.faenaId) throw new ErrorAutorizacion('Sin permisos: el técnico no pertenece a la faena de la OT')
  }

  const total =
    data.horasNormales * data.tarifaNormal +
    data.horasExtra * data.tarifaExtra

  await prisma.manoObraOT.create({
    data: {
      otId: data.otId,
      faenaId: ot.faenaId,
      nombre: data.nombre,
      tecnicoId: data.tecnicoId || null,
      trabajadorId: data.trabajadorId || null,
      horasNormales: data.horasNormales,
      horasExtra: data.horasExtra,
      tarifaNormal: data.tarifaNormal,
      tarifaExtra: data.tarifaExtra,
      total,
    },
  })

  await recalcularCostoManoObra(data.otId, ot.faenaId)
  revalidatePath(`/ot/${data.otId}`)
}

export async function eliminarManoObra(id: string, otId: string) {
  const sesion = await requireSesion()
  requireRolPermitido(sesion, ROLES_GESTION_OT)

  const ot = await prisma.ordenTrabajo.findUniqueOrThrow({
    where: { id: otId },
    select: { faenaId: true },
  })
  requireAlcanceFaena(sesion, ot.faenaId)
  const entrada = await prisma.manoObraOT.findUnique({ where: { id }, select: { otId: true } })
  if (!entrada || entrada.otId !== otId) throw new ErrorAutorizacion('Sin permisos: la entrada de mano de obra no pertenece a esa OT')

  await prisma.manoObraOT.delete({ where: { id } })
  await recalcularCostoManoObra(otId, ot.faenaId)
  revalidatePath(`/ot/${otId}`)
}
