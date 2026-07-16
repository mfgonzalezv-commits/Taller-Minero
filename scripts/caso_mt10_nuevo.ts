import { prisma } from '../src/lib/prisma'

async function main() {
  const ot = await prisma.ordenTrabajo.create({
    data: {
      equipoId: 'cf19dab0-7c39-43c0-8656-c3178f4c0b43', // MT10
      faenaId:  '76c2c9b1-85fc-4d0b-bff9-bb32426e7fe8',
      creadoPorId: '565fe523-0fb8-41e8-ba99-b7c5efc52ab5',
      tipoMantenimiento: 'CORRECTIVO',
      prioridad: 'ALTA',
      origenFalla: 'REPORTE_OPERADOR',
      reportadaPorNombre: 'Marco Díaz (Operador turno tarde)',
      descripcionFalla: 'Fuga severa de aceite hidráulico en zona de cilindro de dirección lado derecho. Operador reporta dirección muy pesada y pérdida progresiva de control de la cuchilla durante faena de perfilado. Se observa charco de aceite bajo el equipo al término del turno. El equipo fue detenido de inmediato por seguridad.',
      estado: 'PROGRAMADA',
      costoHoraSnapshot: 210000,
    },
  })

  await prisma.equipo.update({
    where: { id: 'cf19dab0-7c39-43c0-8656-c3178f4c0b43' },
    data: { estado: 'FUERA_DE_SERVICIO' },
  })

  console.log(`✅ OT #${ot.numeroOt} creada — MT10 Motoniveladora`)
  console.log(`   ID: ${ot.id}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
