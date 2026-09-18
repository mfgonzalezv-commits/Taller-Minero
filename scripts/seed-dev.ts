// Carga datos MÍNIMOS y 100% sintéticos (no copiados de producción) para
// poder desarrollar y probar localmente. Pensado para correr solo contra
// erp_minera_dev — impedirEjecucionEnProduccion() corta si detecta la base
// de producción, aunque alguien corra este script por error con la
// DATABASE_URL productiva cargada.
import { prisma } from '../src/lib/prisma'
import { impedirEjecucionEnProduccion } from '../src/lib/db-guard'
import { hash } from 'bcryptjs'

impedirEjecucionEnProduccion('seed-dev (datos sintéticos de desarrollo)')

async function main() {
  const passwordHash = await hash('password123', 10)

  const faena = await prisma.faena.upsert({
    where: { codigo: 'DEV01' },
    update: {},
    create: {
      codigo: 'DEV01',
      nombre: 'Faena Demo Desarrollo',
      empresa: 'Empresa Demo S.A.',
      ubicacion: 'Zona de pruebas',
    },
  })

  await prisma.usuario.upsert({
    where: { email: 'admin@dev.local' },
    update: {},
    create: {
      faenaId: faena.id,
      nombre: 'Admin Demo',
      email: 'admin@dev.local',
      password: passwordHash,
      rol: 'ADMINISTRADOR',
    },
  })

  await prisma.usuario.upsert({
    where: { email: 'mecanico@dev.local' },
    update: {},
    create: {
      faenaId: faena.id,
      nombre: 'Mecánico Demo',
      email: 'mecanico@dev.local',
      password: passwordHash,
      rol: 'MECANICO',
    },
  })

  const equiposDemo = [
    { codigo: 'DEV-EQ-01', nombre: 'Maquinaria Demo', tipo: 'MAQUINARIA' as const },
    { codigo: 'DEV-EQ-02', nombre: 'Camión Tolva Demo', tipo: 'CAMION' as const },
  ]
  for (const eq of equiposDemo) {
    await prisma.equipo.upsert({
      where: { faenaId_codigo: { faenaId: faena.id, codigo: eq.codigo } },
      update: {},
      create: { ...eq, faenaId: faena.id },
    })
  }

  console.log('Seed de desarrollo listo.')
  console.log('  Login admin:     admin@dev.local / password123')
  console.log('  Login mecánico:  mecanico@dev.local / password123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
