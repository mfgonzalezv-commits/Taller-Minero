import { prisma } from '../src/lib/prisma'

const OT_ID    = 'c532e53f-4fd4-4ac3-82f0-75a8ce72282f'
const FAENA_ID = '76c2c9b1-85fc-4d0b-bff9-bb32426e7fe8'
const U_JEFE   = '23cbc8c4-e367-4bbe-a739-4be943319670'
const T_PEDRO  = 'Pedro Soto'

async function main() {
  // ── 1. Actualizar trabajoEjecutado ────────────────────────────────────────
  await prisma.ordenTrabajo.update({
    where: { id: OT_ID },
    data: {
      trabajoEjecutado: `1. Retiro y reemplazo de 5 mt de cable de señal pesómetro (4 conductores AWG 22) en zona de tolva.
2. Instalación de canal protector y manguera espiral sobre cableado nuevo (cobertura 100%).
3. Cambio de conector Deutsch DT04-4P macho con crimpeado de 8 terminales nuevos.
4. Calibración de celda de carga con instalación de Shunt Resistor 350 Ohm ± 0.01% (Pesaje Industrial SpA).
5. Verificación de lectura pesómetro con pesos patrones — error final ±0.2%.
6. Trabajos adicionales aprovechando detención:
   - Lavado externo completo del equipo (tolva, chasis, cabina).
   - Lavado de radiadores (agua y aceite) — se detectó acumulación de tierra.
   - Engrase general de pasadores, pines de tolva y articulaciones de dirección.
   - Reparación de pisadera lado conductor: soldadura de soporte inferior quebrado y pintura anticorrosiva.`,
      causaRaiz: 'Ausencia de canal protector en cableado original del pesómetro. Cables expuestos a roce con material en zona de tolva durante operación normal. Se recomienda inspección preventiva en CF82 y CF84.',
    },
  })
  console.log('✅ trabajoEjecutado y causaRaiz actualizados')

  // ── 2. Bitácora: trabajos extras aprovechando detención ───────────────────
  await prisma.bitacoraOT.create({
    data: {
      otId: OT_ID,
      usuarioId: U_JEFE,
      fechaHora: new Date(new Date().setDate(new Date().getDate() - 1)),
      horaInicio: '16:00',
      horaTermino: '18:30',
      personal: [T_PEDRO, 'Jorge Fuentes (Auxiliar)'],
      tipoIntervencion: 'MANTENIMIENTO',
      descripcion: `Aprovechando la detención del CF83, se ejecutaron trabajos de mantención general:

• LAVADO EXTERNO: lavado completo del equipo con hidrolavadora — tolva, chasis, cabina, neumáticos. Se removió acumulación de barro y material fino adherido.

• LAVADO DE RADIADORES: lavado de radiador de agua y radiador de aceite con agua a presión. Ambos presentaban taponamiento parcial por tierra. Se recuperó flujo de aire al 100%.

• ENGRASE GENERAL: engrase de pasadores de tolva (2 puntos), pines de articulación de dirección (4 puntos), pasadores de cilindros de levante (2 puntos) y rótulas de barra de dirección (2 puntos). Se consumieron 4 cartuchos de grasa multiuso.

• REPARACIÓN PISADERA: soporte inferior de pisadera lado conductor presentaba fisura por fatiga. Se ejecutó soldadura MIG con electrodo E70S-6. Pintura anticorrosiva aplicada en zona reparada.`,
    },
  })
  console.log('✅ Bitácora de trabajos extras creada')

  // ── 3. Repuesto EXTERNO: materiales extras ────────────────────────────────
  await prisma.repuestoOT.createMany({
    data: [
      {
        otId: OT_ID, faenaId: FAENA_ID,
        descripcion: 'Grasa multiuso cartucho 400g (consumido en engrase general)',
        cantidad: 4, unidad: 'un', precioUnit: 3200, total: 12800,
        estadoSolicitud: 'EXTERNO',
      },
      {
        otId: OT_ID, faenaId: FAENA_ID,
        descripcion: 'Pintura anticorrosiva 1/4 gl — reparación pisadera',
        cantidad: 1, unidad: 'gl', precioUnit: 8500, total: 8500,
        estadoSolicitud: 'EXTERNO',
      },
    ],
  })
  console.log('✅ Materiales extras registrados')

  // ── 4. Mano de obra: extras ───────────────────────────────────────────────
  await prisma.manoObraOT.create({
    data: {
      otId: OT_ID, faenaId: FAENA_ID,
      nombre: T_PEDRO,
      trabajadorId: '5b82fd95-05dc-441e-a8b9-c715504e94fa',
      horasNormales: 2.5, horasExtra: 0,
      tarifaNormal: 3100, tarifaExtra: 0,
      total: 7750,
    },
  })
  await prisma.manoObraOT.create({
    data: {
      otId: OT_ID, faenaId: FAENA_ID,
      nombre: 'Jorge Fuentes (Auxiliar)',
      horasNormales: 2.5, horasExtra: 0,
      tarifaNormal: 2400, tarifaExtra: 0,
      total: 6000,
    },
  })
  console.log('✅ Mano de obra extras registrada')

  console.log('\n✅ OT #29 CF83 actualizada con detalle completo de trabajo ejecutado')
}

main().catch(console.error).finally(() => prisma.$disconnect())
