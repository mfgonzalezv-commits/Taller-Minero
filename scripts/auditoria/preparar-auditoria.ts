// Prepara los usuarios por rol y la faena ficticia SIM-02 para la auditoría de procesos.
// SOLO erp_minera_dev. Idempotente: recrea SIM-02 y completa los usuarios de rol que falten en SIM-01.
// Uso: npx tsx scripts/auditoria/preparar-auditoria.ts
import 'dotenv/config'
import { createHash } from 'crypto'
import { hash } from 'bcryptjs'
import { prisma } from '../../src/lib/prisma'
import { impedirEjecucionEnProduccion } from '../../src/lib/db-guard'
import { borrarFaenaSimulada } from './borrar-faena'

impedirEjecucionEnProduccion('auditoria/preparar-auditoria (SIM-02 y usuarios por rol)')

let n = 0
const id = () => {
  const h = createHash('md5').update(`AUD-SIM02:${n++}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

async function main() {
  const sim1 = await prisma.faena.findUnique({ where: { codigo: 'SIM-01' } })
  if (!sim1) throw new Error('SIM-01 no existe: ejecuta primero scripts/simulacion-tres-meses.ts')
  const pw = await hash('password123', 10)

  // Integridad mínima de SIM-01
  const [eq, ot, ep] = await Promise.all([
    prisma.equipo.count({ where: { faenaId: sim1.id } }),
    prisma.ordenTrabajo.count({ where: { faenaId: sim1.id } }),
    prisma.estadoPago.count({ where: { faenaId: sim1.id } }),
  ])
  console.log(`SIM-01: ${eq} equipos, ${ot} OT, ${ep} Estados de Pago`)

  // Roles que SIM-01 no trae: Jefe/Planificador Central y Operador (pertenecen a la faena de SIM-01)
  for (const [email, rol, nombre] of [
    ['jefecentral@sim.local', 'JEFE_TALLER_CENTRAL', 'Sim Jefe Taller Central'],
    ['plancentral@sim.local', 'PLANIFICADOR_CENTRAL', 'Sim Planificador Central'],
    ['operador@sim.local', 'OPERADOR', 'Sim Operador'],
  ] as const) {
    await prisma.usuario.upsert({ where: { email }, update: { rol, faenaId: sim1.id, activo: true }, create: { id: id(), faenaId: sim1.id, nombre, email, password: pw, rol } })
  }

  // SIM-02: se recrea completa
  await borrarFaenaSimulada('SIM-02')
  const faenaId = id()
  await prisma.faena.create({ data: { id: faenaId, codigo: 'SIM-02', nombre: 'Faena Simulada 2 (aislamiento)', empresa: 'Empresa Ficticia S.A.', ubicacion: 'Simulación' } })
  const us = [
    ['jefe2', 'JEFE_TALLER'], ['plan2', 'PLANIFICADOR'], ['mecanico2b', 'MECANICO'], ['bodega2', 'BODEGA'], ['operador2', 'OPERADOR'],
  ].map(([u, rol]) => ({ id: id(), faenaId, nombre: `Sim2 ${u}`, email: `${u}@sim2.local`, password: pw, rol: rol as never }))
  await prisma.usuario.createMany({ data: us })
  const mec = us.find(u => u.rol === 'MECANICO')!
  const tecnicoId = id()
  await prisma.tecnico.create({ data: { id: tecnicoId, usuarioId: mec.id, faenaId, especialidades: ['Motor'], turno: 'Día', tarifaHora: 9000, tarifaHoraExtra: 13500 } })
  const equipos = [1, 2].map(i => ({ id: id(), faenaId, codigo: `SIM2-EQ-0${i}`, nombre: `Equipo SIM-02 ${i}`, tipo: 'MAQUINARIA' as const, costoHoraDetencion: 50_000, horometroActual: 1000 }))
  await prisma.equipo.createMany({ data: equipos })
  await prisma.asignacionEquipoFaena.create({ data: { id: id(), equipoId: equipos[0].id, faenaId, fechaInicio: new Date(2026, 5, 26), contrato: 'SIM2-C1', modalidadArriendo: 'MES', tarifa: 5_000_000, reglaDescuentoDetencion: '100%', politicaProrateo: 'BASE_30' } })
  const itemId = id()
  await prisma.itemBodega.create({ data: { id: itemId, faenaId, codigo: 'SIM2-ITM-001', descripcion: 'Repuesto SIM-02', unidad: 'un', stockActual: 20, stockMinimo: 5, precioRef: 10_000 } })
  await prisma.loteBodega.create({ data: { id: id(), itemId, cantidad: 20, cantidadSaldo: 20, costoUnitario: 10_000, fechaRecepcion: new Date(2026, 5, 25), documento: 'SIM2-FACT' } })
  await prisma.trabajador.create({ data: { id: id(), faenaId, nombre: 'Trabajador SIM-02', tipo: 'DIRECTO', cargo: 'Mecánico', sueldoBruto: 900_000, horasMensuales: 180, tasaLeyesSociales: 0.28 } })
  const jefe2 = us.find(u => u.rol === 'JEFE_TALLER')!
  await prisma.ordenTrabajo.create({ data: { id: id(), faenaId, equipoId: equipos[0].id, tipoMantenimiento: 'CORRECTIVO', estado: 'EN_DIAGNOSTICO', prioridad: 'MEDIA', descripcionFalla: 'OT ficticia de SIM-02', creadoPorId: jefe2.id, responsableId: mec.id, tecnicoAsignadoId: tecnicoId, costoHoraSnapshot: 50_000 } })
  console.log('SIM-02 lista (2 equipos, 5 usuarios, 1 OT, 1 ítem de bodega). Usuarios de rol adicionales en SIM-01 creados.')
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
