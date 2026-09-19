// Importador de datos reales: lee planillas CSV, valida contra la base (solo lectura) y, solo con
// --apply y todas las confirmaciones, inserta TODO en una única transacción. Nunca actualiza ni
// borra: lo existente idéntico se ignora y lo distinto es un conflicto que bloquea la carga.
import fs from 'fs'
import path from 'path'
import { randomBytes, randomUUID } from 'crypto'
import { hash } from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { parsearCsv } from './csv'
import { HOJAS, validarCarga, informeATexto, type DatosPlanilla, type Existente, type Hoja, type Informe, type Plan } from './validador'
import { verificarApply, type ArgsApply } from './guardia'

const TOL = 0.005

export function leerPlanillas(dir: string): DatosPlanilla {
  const d: DatosPlanilla = { encabezados: {}, faenas: [], usuarios: [], equipos: [], asignaciones: [], items_bodega: [], lotes: [] }
  for (const h of HOJAS as readonly Hoja[]) {
    const ruta = path.join(dir, `${h}.csv`)
    if (!fs.existsSync(ruta)) continue
    const { encabezados, filas } = parsearCsv(fs.readFileSync(ruta, 'utf8'))
    d.encabezados[h] = encabezados
    ;(d[h] as unknown[]) = filas
  }
  return d
}

/** Foto de solo lectura de lo que ya existe y podría chocar con la carga. */
export async function leerExistente(prisma: PrismaClient, d: DatosPlanilla, faenaCodigo: string): Promise<Existente> {
  const cod = faenaCodigo.toUpperCase()
  const ex: Existente = { faenas: new Map(), usuarios: new Map(), equipos: new Map(), asignaciones: new Map(), items: new Map() }
  const faena = await prisma.faena.findUnique({ where: { codigo: cod } })
  if (faena) ex.faenas.set(cod, { nombre: faena.nombre, empresa: faena.empresa, ubicacion: faena.ubicacion })

  const emails = d.usuarios.map(u => (u.email ?? '').toLowerCase()).filter(Boolean)
  for (const u of await prisma.usuario.findMany({ where: { email: { in: emails } }, include: { faena: { select: { codigo: true } } } })) {
    ex.usuarios.set(u.email.toLowerCase(), { nombre: u.nombre, rol: u.rol, faena: u.faena.codigo })
  }
  if (faena) {
    for (const u of await prisma.usuario.findMany({ where: { faenaId: faena.id, email: { notIn: emails } }, select: { email: true, nombre: true, rol: true } })) ex.usuarios.set(u.email.toLowerCase(), { nombre: u.nombre, rol: u.rol, faena: cod })
    const equipos = await prisma.equipo.findMany({ where: { faenaId: faena.id }, include: { asignaciones: true } })
    for (const e of equipos) {
      const c = e.codigo.toUpperCase()
      ex.equipos.set(`${cod}|${c}`, { nombre: e.nombre, tipo: e.tipo, marca: e.marca, modelo: e.modelo, patente: e.patente, anio: e.anio, costoHoraDetencion: Number(e.costoHoraDetencion) })
      ex.asignaciones.set(`${cod}|${c}`, e.asignaciones.map(a => ({ inicio: a.fechaInicio, fin: a.fechaTermino, modalidad: a.modalidadArriendo, tarifa: a.tarifa == null ? null : Number(a.tarifa), regla: a.reglaDescuentoDetencion, politica: a.politicaProrateo, contrato: a.contrato })))
    }
    for (const it of await prisma.itemBodega.findMany({ where: { faenaId: faena.id }, include: { lotes: true } })) {
      ex.items.set(`${cod}|${it.codigo.toUpperCase()}`, {
        descripcion: it.descripcion, unidad: it.unidad, stockActual: Number(it.stockActual), stockMinimo: Number(it.stockMinimo), precioRef: Number(it.precioRef),
        lotes: new Map(it.lotes.filter(l => l.documento).map(l => [l.documento as string, { cantidad: Number(l.cantidad), costo: Number(l.costoUnitario), fecha: l.fechaRecepcion }])),
      })
    }
  }
  return ex
}

export interface ResultadoAplicacion { credenciales: { email: string; passwordTemporal: string }[]; creados: Record<string, number> }

/** Inserta el plan completo en UNA transacción y verifica los invariantes antes de confirmar. */
export async function aplicarPlan(prisma: PrismaClient, plan: Plan, opts: { simularFalla?: boolean } = {}): Promise<ResultadoAplicacion> {
  const credenciales: ResultadoAplicacion['credenciales'] = []
  const hashes = new Map<string, string>()
  for (const u of plan.usuarios) {
    const pw = u.passwordTemporal ?? randomBytes(9).toString('base64url')
    if (!u.passwordTemporal) credenciales.push({ email: u.email, passwordTemporal: pw })
    hashes.set(u.email, await hash(pw, 10))
  }

  const creados = await prisma.$transaction(async (tx) => {
    let faena = await tx.faena.findUnique({ where: { codigo: plan.faenaCodigo } })
    if (plan.faena) faena = await tx.faena.create({ data: { codigo: plan.faena.codigo, nombre: plan.faena.nombre, empresa: plan.faena.empresa, ubicacion: plan.faena.ubicacion } })
    if (!faena) throw new Error(`La faena ${plan.faenaCodigo} no existe`)
    const faenaId = faena.id

    // Usuarios y técnicos
    const usuarios = plan.usuarios.map(u => ({ id: randomUUID(), u }))
    await tx.usuario.createMany({ data: usuarios.map(({ id, u }) => ({ id, faenaId, nombre: u.nombre, email: u.email, password: hashes.get(u.email) as string, rol: u.rol as never })) })
    await tx.tecnico.createMany({ data: usuarios.filter(({ u }) => u.rol === 'MECANICO').map(({ id, u }) => ({ usuarioId: id, faenaId, especialidades: u.especialidades, turno: u.turno, tarifaHora: u.tarifaHora, tarifaHoraExtra: u.tarifaHoraExtra })) })

    // Equipos y asignaciones
    const idEquipo = new Map<string, string>()
    for (const e of await tx.equipo.findMany({ where: { faenaId }, select: { id: true, codigo: true } })) idEquipo.set(e.codigo.toUpperCase(), e.id)
    const equipos = plan.equipos.map(e => ({ id: randomUUID(), e }))
    for (const { id, e } of equipos) idEquipo.set(e.codigo, id)
    await tx.equipo.createMany({ data: equipos.map(({ id, e }) => ({ id, faenaId, codigo: e.codigo, nombre: e.nombre, tipo: e.tipo as never, marca: e.marca, modelo: e.modelo, patente: e.patente, anio: e.anio, costoHoraDetencion: e.costoHoraDetencion, horometroActual: e.horometroInicial })) })
    await tx.asignacionEquipoFaena.createMany({ data: plan.asignaciones.map(a => ({ equipoId: idEquipo.get(a.equipoCodigo) as string, faenaId, fechaInicio: a.inicio, fechaTermino: a.fin, contrato: a.contrato, modalidadArriendo: a.modalidad as never, tarifa: a.tarifa, reglaDescuentoDetencion: a.regla, politicaProrateo: a.politica as never })) })

    // Bodega: ítem + lotes + movimiento de ENTRADA por lote (con snapshots encadenados) + consumo de trazabilidad
    const items = plan.items.map(i => ({ id: randomUUID(), i }))
    await tx.itemBodega.createMany({ data: items.map(({ id, i }) => ({ id, faenaId, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, stockActual: i.lotes.reduce((a, l) => a + l.cantidad, 0), stockMinimo: i.stockMinimo, stockMaximo: i.stockMaximo, criticidad: i.criticidad as never, precioRef: i.precioRef, categoria: i.categoria })) })
    const lotes: { id: string; itemId: string; cantidad: number; cantidadSaldo: number; costoUnitario: number; fechaRecepcion: Date; documento: string }[] = []
    const movs: { id: string; itemId: string; faenaId: string; tipo: string; cantidad: number; stockAntes: number; stockDespues: number; observacion: string; createdAt: Date }[] = []
    const consumos: { loteId: string; movimientoId: string; cantidad: number; costoUnitario: number }[] = []
    for (const { id, i } of items) {
      let acum = 0
      for (const l of [...i.lotes].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())) {
        const loteId = randomUUID(), movId = randomUUID()
        lotes.push({ id: loteId, itemId: id, cantidad: l.cantidad, cantidadSaldo: l.cantidad, costoUnitario: l.costo, fechaRecepcion: l.fecha, documento: l.ref })
        movs.push({ id: movId, itemId: id, faenaId, tipo: 'ENTRADA', cantidad: l.cantidad, stockAntes: acum, stockDespues: acum + l.cantidad, observacion: `Carga inicial — lote ${l.ref}`, createdAt: l.fecha })
        consumos.push({ loteId, movimientoId: movId, cantidad: l.cantidad, costoUnitario: l.costo })
        acum += l.cantidad
      }
    }
    await tx.loteBodega.createMany({ data: lotes })
    await tx.movimientoBodega.createMany({ data: movs })
    await tx.consumoLoteBodega.createMany({ data: consumos })

    // Invariantes: stock = suma de lotes = suma de entradas, para cada ítem cargado
    for (const { id, i } of items) {
      const it = await tx.itemBodega.findUniqueOrThrow({ where: { id }, select: { stockActual: true } })
      const ls = await tx.loteBodega.findMany({ where: { itemId: id }, select: { cantidadSaldo: true } })
      const suma = ls.reduce((a, l) => a + Number(l.cantidadSaldo), 0)
      if (Math.abs(Number(it.stockActual) - suma) > TOL) throw new Error(`Invariante violado en ${i.codigo}: stock ${it.stockActual} ≠ suma de lotes ${suma}`)
    }

    const creados = { faena: plan.faena ? 1 : 0, usuarios: usuarios.length, tecnicos: usuarios.filter(({ u }) => u.rol === 'MECANICO').length, equipos: equipos.length, asignaciones: plan.asignaciones.length, items: items.length, lotes: lotes.length }
    await tx.registroAuditoria.create({ data: { faenaId, entidad: 'Faena', entidadId: faenaId, accion: 'CARGA_INICIAL', valorNuevo: creados, motivo: 'Importador de datos reales' } })
    if (opts.simularFalla) throw new Error('Falla simulada (prueba de rollback)')
    return creados
  }, { timeout: 120_000, maxWait: 20_000 })

  return { credenciales, creados }
}

export interface OpcionesCarga extends ArgsApply { dir: string; faena: string; baseActual: string; carpetaSalida?: string }
export interface ResultadoCarga { informe: Informe; texto: string; aplicado: boolean; resultado?: ResultadoAplicacion; rechazo?: string; archivoInforme?: string; archivoCredenciales?: string }

export async function ejecutarCarga(prisma: PrismaClient, o: OpcionesCarga): Promise<ResultadoCarga> {
  const rechazo = verificarApply(o, o.baseActual)
  const datos = leerPlanillas(o.dir)
  const existente = await leerExistente(prisma, datos, o.faena)
  const informe = validarCarga(datos, existente, o.faena)
  const modo = o.apply ? 'APPLY' : 'DRY-RUN (solo lectura)'
  const texto = informeATexto(informe, { faena: o.faena.toUpperCase(), base: o.baseActual, modo })

  let archivoInforme: string | undefined
  if (o.carpetaSalida) {
    fs.mkdirSync(o.carpetaSalida, { recursive: true })
    archivoInforme = path.join(o.carpetaSalida, `informe-carga-${o.faena.toUpperCase()}-${o.apply ? 'apply' : 'dryrun'}.md`)
    fs.writeFileSync(archivoInforme, texto)
  }
  if (!o.apply) return { informe, texto, aplicado: false, archivoInforme }
  if (rechazo) return { informe, texto, aplicado: false, rechazo, archivoInforme }
  if (!informe.plan) return { informe, texto, aplicado: false, rechazo: 'La validación tiene errores: no se escribe nada', archivoInforme }

  const p = informe.plan
  const hayNuevos = p.faena || p.usuarios.length || p.equipos.length || p.asignaciones.length || p.items.length
  if (!hayNuevos) return { informe, texto, aplicado: false, rechazo: 'Nada nuevo que cargar (la carga ya está aplicada: idempotente)', archivoInforme }

  const resultado = await aplicarPlan(prisma, p, { simularFalla: o.simularFalla })
  let archivoCredenciales: string | undefined
  if (resultado.credenciales.length && o.carpetaSalida) {
    archivoCredenciales = path.join(o.carpetaSalida, `credenciales-${o.faena.toUpperCase()}.csv`)
    fs.writeFileSync(archivoCredenciales, 'email;password_temporal\n' + resultado.credenciales.map(c => `${c.email};${c.passwordTemporal}`).join('\n') + '\n')
  }
  return { informe, texto, aplicado: true, resultado, archivoInforme, archivoCredenciales }
}
