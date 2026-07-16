import { PrismaClient, RolUsuario, TipoEquipo, EstadoEquipo, EstadoOT, PrioridadOT } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { hash } from 'bcryptjs'
import 'dotenv/config'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Limpiar datos existentes
  await prisma.horometroKm.deleteMany()
  await prisma.historialEstadoOT.deleteMany()
  await prisma.ordenTrabajo.deleteMany()
  await prisma.tecnico.deleteMany()
  await prisma.equipo.deleteMany()
  await prisma.usuario.deleteMany()
  await prisma.faena.deleteMany()

  // Crear faena
  const faena = await prisma.faena.create({
    data: {
      nombre: 'Faena San Ramon',
      codigo: 'FSR-001',
      ubicacion: 'Región de Atacama',
      activa: true,
    },
  })

  const password = await hash('password123', 10)

  // Crear usuarios (1 por rol)
  const usuarios = await Promise.all([
    prisma.usuario.create({
      data: {
        faenaId: faena.id,
        nombre: 'Admin',
        email: 'admin@faena.cl',
        password,
        rol: RolUsuario.ADMINISTRADOR,
      },
    }),
    prisma.usuario.create({
      data: {
        faenaId: faena.id,
        nombre: 'Jefe Taller',
        email: 'jefe@faena.cl',
        password,
        rol: RolUsuario.JEFE_TALLER,
      },
    }),
    prisma.usuario.create({
      data: {
        faenaId: faena.id,
        nombre: 'Mecánico 1',
        email: 'mecanico1@faena.cl',
        password,
        rol: RolUsuario.MECANICO,
      },
    }),
    prisma.usuario.create({
      data: {
        faenaId: faena.id,
        nombre: 'Bodeguero',
        email: 'bodega@faena.cl',
        password,
        rol: RolUsuario.BODEGA,
      },
    }),
  ])

  // Crear técnicos
  const tecnico1 = await prisma.tecnico.create({
    data: {
      usuarioId: usuarios[2].id,
      faenaId: faena.id,
      especialidades: ['Hidráulica', 'Motor'],
      turno: 'Día',
      disponible: true,
    },
  })

  // Crear equipos
  const equipos = await Promise.all([
    prisma.equipo.create({
      data: {
        faenaId: faena.id,
        codigo: 'CAM-001',
        nombre: 'Camión Volquete 1',
        tipo: TipoEquipo.CAMION,
        marca: 'Volvo',
        modelo: 'FH16',
        anio: 2020,
        ubicacionActual: 'Patio Principal',
        estado: EstadoEquipo.OPERATIVO,
        horometroActual: 15000,
        kilometrajeActual: 150000,
        costoHoraDetencion: 500,
      },
    }),
    prisma.equipo.create({
      data: {
        faenaId: faena.id,
        codigo: 'MAQ-001',
        nombre: 'Excavadora CAT 320',
        tipo: TipoEquipo.MAQUINARIA,
        marca: 'Caterpillar',
        modelo: '320D',
        anio: 2019,
        ubicacionActual: 'Zona de Carga',
        estado: EstadoEquipo.DETENIDO,
        horometroActual: 8500,
        costoHoraDetencion: 1200,
      },
    }),
    prisma.equipo.create({
      data: {
        faenaId: faena.id,
        codigo: 'LIV-001',
        nombre: 'Camioneta Oficina',
        tipo: TipoEquipo.LIVIANO,
        marca: 'Toyota',
        modelo: 'Hilux',
        anio: 2022,
        ubicacionActual: 'Estacionamiento',
        estado: EstadoEquipo.OPERATIVO,
        kilometrajeActual: 45000,
      },
    }),
    prisma.equipo.create({
      data: {
        faenaId: faena.id,
        codigo: 'MAQ-002',
        nombre: 'Cargador Frontal',
        tipo: TipoEquipo.MAQUINARIA,
        marca: 'Caterpillar',
        modelo: '950',
        anio: 2018,
        ubicacionActual: 'Zona de Chancado',
        estado: EstadoEquipo.TALLER,
        horometroActual: 12000,
        costoHoraDetencion: 800,
      },
    }),
  ])

  // Crear OTs en distintos estados
  const ot1 = await prisma.ordenTrabajo.create({
    data: {
      faenaId: faena.id,
      equipoId: equipos[0].id,
      tipoMantenimiento: 'PREVENTIVO',
      estado: EstadoOT.EN_REPARACION,
      prioridad: PrioridadOT.ALTA,
      descripcionFalla: 'Mantenimiento preventivo motor',
      diagnostico: 'Cambio de aceite y filtros',
      creadoPorId: usuarios[1].id,
      tecnicoAsignadoId: tecnico1.id,
      responsableId: tecnico1.usuarioId,
      costoHoraSnapshot: 500,
      fechaCreacion: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  })

  await prisma.historialEstadoOT.create({
    data: {
      otId: ot1.id,
      faenaId: faena.id,
      estadoAnterior: EstadoOT.ABIERTA,
      estadoNuevo: EstadoOT.EN_REPARACION,
      usuarioId: usuarios[1].id,
      fechaCambio: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  })

  const ot2 = await prisma.ordenTrabajo.create({
    data: {
      faenaId: faena.id,
      equipoId: equipos[1].id,
      tipoMantenimiento: 'CORRECTIVO',
      estado: EstadoOT.EN_DIAGNOSTICO,
      prioridad: PrioridadOT.CRITICA,
      descripcionFalla: 'Excavadora no enciende',
      creadoPorId: usuarios[1].id,
      responsableId: usuarios[1].id,
      costoHoraSnapshot: 1200,
      fechaCreacion: new Date(Date.now() - 8 * 60 * 60 * 1000),
    },
  })

  console.log('✓ Seed completado')
  console.log('- Faena:', faena.codigo)
  console.log('- Usuarios:', usuarios.length)
  console.log('- Equipos:', equipos.length)
  console.log('- OTs:', 2)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
