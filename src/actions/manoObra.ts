'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { calcularTasaOverhead } from './trabajadores'

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
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  const total =
    data.horasNormales * data.tarifaNormal +
    data.horasExtra * data.tarifaExtra

  await prisma.manoObraOT.create({
    data: {
      otId: data.otId,
      faenaId: session.user.faenaId,
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

  await recalcularCostoManoObra(data.otId, session.user.faenaId)
  revalidatePath(`/ot/${data.otId}`)
}

export async function eliminarManoObra(id: string, otId: string) {
  const session = await auth()
  if (!session?.user?.faenaId) throw new Error('Sin sesión')

  await prisma.manoObraOT.delete({ where: { id } })
  await recalcularCostoManoObra(otId, session.user.faenaId)
  revalidatePath(`/ot/${otId}`)
}
