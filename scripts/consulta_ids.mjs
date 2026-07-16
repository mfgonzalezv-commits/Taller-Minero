import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const equipo = await prisma.equipo.findFirst({ where: { codigo: 'CF83' }, select: { id: true, nombre: true, faenaId: true } })
const usuarios = await prisma.usuario.findMany({ select: { id: true, nombre: true, rol: true } })
const trabajadores = await prisma.trabajador.findMany({ where: { activo: true }, select: { id: true, nombre: true, cargo: true } })

console.log('EQUIPO:', JSON.stringify(equipo, null, 2))
console.log('USUARIOS:', JSON.stringify(usuarios, null, 2))
console.log('TRABAJADORES:', JSON.stringify(trabajadores, null, 2))

await prisma.$disconnect()
