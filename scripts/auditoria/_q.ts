import 'dotenv/config'
import { prisma } from '../../src/lib/prisma'
prisma.ordenTrabajo.findFirst({ where: { faena: { codigo: 'SIM-02' } } }).then(o => { console.log(o!.id) }).finally(() => prisma.$disconnect())
