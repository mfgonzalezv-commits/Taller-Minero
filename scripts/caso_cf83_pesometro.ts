/**
 * CASO SIMULADO — CF83 Cargador Frontal
 * Falla: Pesómetro sin lectura — cables cortados en tolva
 *
 * Cubre: todos los estados OT, repuestos parciales, espera de repuesto,
 * cambio de personal, herramienta externa, validación con rechazo, cierre.
 */

import { prisma } from '../src/lib/prisma'

// ─── IDs del sistema ─────────────────────────────────────────────────────────
const EQUIPO_ID   = '056a4da7-140d-46ae-b17d-a40ec29f4533'
const FAENA_ID    = '76c2c9b1-85fc-4d0b-bff9-bb32426e7fe8'
const U_ADMIN     = '565fe523-0fb8-41e8-ba99-b7c5efc52ab5'   // Admin
const U_MECANICO  = '8df23368-6cf4-4566-adb9-6dad85f8328b'   // Mecánico 1
const U_JEFE      = '23cbc8c4-e367-4bbe-a739-4be943319670'   // Jefe Taller
const T_CARLOS    = 'Carlos Rojas'      // Mecánico Diesel (diagnóstico inicial)
const T_RIGOBERTO = 'Rigoberto Toledo'  // Mecánico diésel (relevo)
const T_PEDRO     = 'Pedro Soto'        // Ayudante

function diasAtras(d: number, horas = 8): Date {
  const f = new Date()
  f.setDate(f.getDate() - d)
  f.setHours(horas, 0, 0, 0)
  return f
}

async function main() {
  console.log('🚧 Construyendo caso CF83 Pesómetro...\n')

  // ── 1. CREAR OT ─────────────────────────────────────────────────────────────
  const ot = await prisma.ordenTrabajo.create({
    data: {
      equipoId: EQUIPO_ID,
      faenaId: FAENA_ID,
      creadoPorId: U_ADMIN,
      tipoMantenimiento: 'CORRECTIVO',
      prioridad: 'ALTA',
      descripcionFalla: 'Pesómetro sin lectura. Operador reporta que el display no muestra peso desde turno noche. Se sospecha cables cortados en zona de tolva por roce con material.',
      origenFalla: 'REPORTE_OPERADOR',
      reportadaPorNombre: 'Luis Contreras (Operador turno noche)',
      estado: 'PROGRAMADA',
      fechaCreacion: diasAtras(6),
      costoHoraSnapshot: 180000,
    },
  })
  console.log(`✅ OT creada: #${ot.numeroOt} — ${ot.id}`)

  // ── 2. ABIERTA — Jefe asigna mecánico ────────────────────────────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'ABIERTA' } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'PROGRAMADA', estadoNuevo: 'ABIERTA',
    fechaCambio: diasAtras(6, 9), tiempoEnEstadoMin: 60, usuarioId: U_JEFE,
    observacion: 'OT abierta. Se asigna a Carlos Rojas para diagnóstico.'
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_JEFE, fechaHora: diasAtras(6, 9),
    personal: ['Rodrigo Méndez'],
    tipoIntervencion: 'NOTA',
    descripcion: 'OT recibida por jefatura. Se asigna Carlos Rojas para diagnóstico en terreno. El equipo quedó detenido al inicio del turno día.',
    estado: 'ABIERTA',
  }})
  console.log('✅ Estado: ABIERTA')

  // ── 3. EN_DIAGNÓSTICO — Carlos inspecciona ───────────────────────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'EN_DIAGNOSTICO' } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'ABIERTA', estadoNuevo: 'EN_DIAGNOSTICO',
    fechaCambio: diasAtras(6, 10), tiempoEnEstadoMin: 60, usuarioId: U_MECANICO,
    observacion: 'Inicio diagnóstico en terreno.'
  }})

  // Entrada bitácora con solicitud de herramienta externa
  const b1 = await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(6, 10),
    horaInicio: '10:00', horaTermino: '11:30',
    personal: [T_CARLOS, T_PEDRO],
    tipoIntervencion: 'DIAGNOSTICO',
    descripcion: 'Inspección visual en zona de tolva. Se confirman 3 cables de señal del pesómetro cortados por roce con material. Además se detecta conector macho del sensor dañado (pin 3 quemado). Para diagnóstico definitivo y calibración se requiere multímetro de precisión (>0.01mV) y kit de calibración pesómetro marca Rice Lake — NO disponibles en faena. Necesario solicitarlos a empresa especialista externa.',
    estado: null,
  }})
  // Repuestos solicitados desde esta entrada de bitácora
  await prisma.repuestoOT.createMany({ data: [
    { otId: ot.id, faenaId: FAENA_ID, bitacoraId: b1.id, descripcion: 'Cable señal pesómetro 4 conductores AWG 22 (por metro)', cantidad: 5, unidad: 'mt', estadoSolicitud: 'SOLICITADO', registradoById: U_MECANICO },
    { otId: ot.id, faenaId: FAENA_ID, bitacoraId: b1.id, descripcion: 'Conector Deutsch DT04-4P macho 4 pines', cantidad: 2, unidad: 'un', estadoSolicitud: 'SOLICITADO', registradoById: U_MECANICO },
    { otId: ot.id, faenaId: FAENA_ID, bitacoraId: b1.id, descripcion: 'Terminal pin socket Deutsch 0462-201-16141', cantidad: 8, unidad: 'un', estadoSolicitud: 'SOLICITADO', registradoById: U_MECANICO },
  ]})
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { enEsperaRepuesto: true } })

  // Segunda entrada: solicitud formal de especialista externo
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(6, 12),
    personal: [T_CARLOS],
    tipoIntervencion: 'SOLICITUD_REPUESTO',
    descripcion: 'Se solicita a jefatura autorización para contratar servicio técnico externo: empresa Pesaje Industrial SpA (contacto: Felipe Núñez, +56 9 8811 2233) para calibración y verificación del pesómetro Rice Lake 920i. Incluye traslado de equipo de calibración certificado.',
    notaRepuesto: 'Servicio técnico externo — calibración pesómetro Rice Lake 920i',
    setEspera: true,
    estado: 'ESPERA_REPUESTO',
  }})
  console.log('✅ Estado: EN_DIAGNOSTICO — repuestos y especialista solicitados')

  // ── 4. DIAGNOSTICADO — Jefe revisa y autoriza ─────────────────────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'DIAGNOSTICADO' } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'EN_DIAGNOSTICO', estadoNuevo: 'DIAGNOSTICADO',
    fechaCambio: diasAtras(5, 9), tiempoEnEstadoMin: 1380, usuarioId: U_JEFE,
    observacion: 'Diagnóstico revisado y aprobado por jefatura.'
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_JEFE, fechaHora: diasAtras(5, 9),
    personal: ['Rodrigo Méndez', 'Ana Torres'],
    tipoIntervencion: 'NOTA',
    descripcion: 'Diagnóstico aprobado. Se autoriza contratación de Pesaje Industrial SpA. Se solicita a bodega gestionar repuestos urgente. Carlos Rojas continuará la reparación, pero el día 3 estará de guardia — se designa Rigoberto Toledo como relevo para esa jornada.',
    estado: 'DIAGNOSTICADO',
  }})

  // Autorizar los repuestos solicitados
  const repuestosSolicitados = await prisma.repuestoOT.findMany({ where: { otId: ot.id, estadoSolicitud: 'SOLICITADO' } })
  await prisma.repuestoOT.updateMany({ where: { otId: ot.id, estadoSolicitud: 'SOLICITADO' }, data: { estadoSolicitud: 'AUTORIZADO' } })
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_JEFE, fechaHora: diasAtras(5, 9),
    personal: [],
    tipoIntervencion: 'NOTA',
    descripcion: `Repuestos autorizados por jefatura: ${repuestosSolicitados.map(r => r.descripcion).join(' / ')}. Bodega debe gestionar urgente.`,
  }})
  console.log('✅ Estado: DIAGNOSTICADO — repuestos autorizados')

  // ── 5. REPARACION_PROGRAMADA — Espera repuestos y especialista ────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'REPARACION_PROGRAMADA' } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'DIAGNOSTICADO', estadoNuevo: 'REPARACION_PROGRAMADA',
    fechaCambio: diasAtras(5, 10), tiempoEnEstadoMin: 60, usuarioId: U_JEFE,
    observacion: 'Reparación programada para cuando lleguen repuestos y especialista.'
  }})

  // Bodega recibe stock PARCIAL de cable (solo 3mt de 5mt pedidos)
  const repCable = await prisma.repuestoOT.findFirst({ where: { otId: ot.id, descripcion: { contains: 'Cable señal' } } })
  if (repCable) {
    await prisma.repuestoOT.update({ where: { id: repCable.id }, data: {
      estadoSolicitud: 'ENTREGADO', cantidad: 3, precioUnit: 4800, total: 14400,
    }})
    // Crear solicitud por el resto (2mt faltantes) → a compras
    await prisma.repuestoOT.create({ data: {
      otId: ot.id, faenaId: FAENA_ID,
      descripcion: 'Cable señal pesómetro 4 conductores AWG 22 (por metro) [Solicitar a Compras]',
      cantidad: 2, unidad: 'mt', estadoSolicitud: 'EN_COMPRAS',
    }})
    await prisma.bitacoraOT.create({ data: {
      otId: ot.id, usuarioId: U_ADMIN, fechaHora: diasAtras(4, 14),
      personal: [],
      tipoIntervencion: 'NOTA',
      descripcion: 'Bodega entregó parcialmente: Cable señal pesómetro × 3 mt (stock disponible). Faltan 2 mt — derivado a Compras para adquisición urgente.',
    }})
  }

  // Conector y terminales entregados completos
  await prisma.repuestoOT.updateMany({ where: { otId: ot.id, estadoSolicitud: 'AUTORIZADO' }, data: {
    estadoSolicitud: 'ENTREGADO', precioUnit: 3200, total: 6400,
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_ADMIN, fechaHora: diasAtras(4, 15),
    personal: [],
    tipoIntervencion: 'NOTA',
    descripcion: 'Bodega entregó: Conector Deutsch DT04-4P × 2 un y Terminal pin socket × 8 un. Repuestos disponibles para la reparación.',
  }})
  console.log('✅ Estado: REPARACION_PROGRAMADA — entrega parcial cable, resto en compras')

  // Compras consigue los 2mt restantes al día siguiente
  const repResto = await prisma.repuestoOT.findFirst({ where: { otId: ot.id, estadoSolicitud: 'EN_COMPRAS' } })
  if (repResto) {
    await prisma.repuestoOT.update({ where: { id: repResto.id }, data: {
      estadoSolicitud: 'ENTREGADO', precioUnit: 6500, total: 13000, // precio mayor por compra urgente
    }})
    await prisma.bitacoraOT.create({ data: {
      otId: ot.id, usuarioId: U_ADMIN, fechaHora: diasAtras(3, 10),
      personal: [],
      tipoIntervencion: 'NOTA',
      descripcion: 'Compras adquirió y entregó: Cable señal × 2 mt (compra urgente — precio mayor a referencia). Stock completo disponible.',
    }})
  }

  // ── 6. LISTO_PARA_REPARAR ─────────────────────────────────────────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'LISTO_PARA_REPARAR', enEsperaRepuesto: false } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'REPARACION_PROGRAMADA', estadoNuevo: 'LISTO_PARA_REPARAR',
    fechaCambio: diasAtras(3, 11), tiempoEnEstadoMin: 1500, usuarioId: U_JEFE,
    observacion: 'Todos los repuestos disponibles. Especialista externo confirmado para mañana.'
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_JEFE, fechaHora: diasAtras(3, 11),
    personal: ['Rodrigo Méndez'],
    tipoIntervencion: 'NOTA',
    descripcion: 'Repuestos completos confirmados. Felipe Núñez (Pesaje Industrial SpA) confirmó llegada mañana 08:30 con equipo de calibración certificado. Se informa a Carlos Rojas para coordinar. Recordar: el día 2 de reparación Rigoberto Toledo releva a Carlos.',
    estado: 'LISTO_PARA_REPARAR',
  }})
  console.log('✅ Estado: LISTO_PARA_REPARAR — especialista confirmado')

  // ── 7. EN_REPARACION — Día 1: Carlos + especialista externo ──────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'EN_REPARACION', fechaInicioTrabajo: diasAtras(2, 8) } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'LISTO_PARA_REPARAR', estadoNuevo: 'EN_REPARACION',
    fechaCambio: diasAtras(2, 8), tiempoEnEstadoMin: 1380, usuarioId: U_MECANICO,
    observacion: 'Inicio reparación. Especialista externo presente.'
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(2, 8),
    horaInicio: '08:30', horaTermino: '12:00',
    personal: [T_CARLOS, T_PEDRO, 'Felipe Núñez (Especialista externo)'],
    tipoIntervencion: 'REPARACION',
    descripcion: 'Inicio reparación. Felipe Núñez (Pesaje Industrial SpA) presente con equipo de calibración Rice Lake. Trazado y retiro de cableado dañado. Remoción de conector quemado. Instalación de 4 mt de cable nuevo con canal protector adicional para evitar roce futuro.',
    estado: 'EN_REPARACION',
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(2, 13),
    horaInicio: '13:00', horaTermino: '17:30',
    personal: [T_CARLOS, T_PEDRO, 'Felipe Núñez (Especialista externo)'],
    tipoIntervencion: 'REPARACION',
    descripcion: 'Tarde: instalación conector DT04-4P nuevo. Crimpeado de 8 terminales con herramienta certificada del especialista. Prueba de continuidad OK en todos los conductores. Felipe realiza primera conexión al display — el pesómetro enciende pero lectura inestable. Se requiere ajuste de celda de carga y calibración con pesos patrones. Felipe programa calibración para mañana temprano con pesos de referencia que trae en camioneta.',
  }})
  // Mano de obra día 1
  await prisma.manoObraOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, nombre: T_CARLOS, trabajadorId: '48d79812-524a-4c2a-b7f3-88f13ee97acd',
    horasNormales: 9, horasExtra: 0, tarifaNormal: 5200, tarifaExtra: 7800, total: 46800,
  }})
  await prisma.manoObraOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, nombre: T_PEDRO, trabajadorId: '5b82fd95-05dc-441e-a8b9-c715504e94fa',
    horasNormales: 9, horasExtra: 0, tarifaNormal: 3100, tarifaExtra: 4650, total: 27900,
  }})
  await prisma.manoObraOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, nombre: 'Felipe Núñez (Especialista externo)',
    horasNormales: 9, horasExtra: 0, tarifaNormal: 18000, tarifaExtra: 0, total: 162000,
  }})

  // ── 8. ESPERA_REPUESTO — falta kit de calibración específico ─────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'ESPERA_REPUESTO', enEsperaRepuesto: true } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'EN_REPARACION', estadoNuevo: 'ESPERA_REPUESTO',
    fechaCambio: diasAtras(2, 17), tiempoEnEstadoMin: 570, usuarioId: U_MECANICO,
    observacion: 'Pausa: Felipe detecta que la celda de carga tiene deriva fuera de rango — requiere shunt resistor de calibración específico que no trajo.'
  }})

  const b2 = await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(2, 17),
    personal: [T_CARLOS, 'Felipe Núñez (Especialista externo)'],
    tipoIntervencion: 'SOLICITUD_REPUESTO',
    descripcion: 'Felipe detecta que la celda de carga tiene deriva de ±3% — fuera de tolerancia del proceso. Requiere Shunt Resistor de calibración 350 Ohm ± 0.01% (P/N: RL-SR-350) que debe venir desde Santiago. Felipe coordinará despacho express desde su empresa para mañana antes de las 10:00.',
    setEspera: true,
    estado: 'ESPERA_REPUESTO',
    notaRepuesto: 'Shunt Resistor calibración 350 Ohm ± 0.01% (P/N: RL-SR-350)',
  }})
  await prisma.repuestoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, bitacoraId: b2.id,
    descripcion: 'Shunt Resistor calibración 350 Ohm ± 0.01% (P/N: RL-SR-350) — Pesaje Industrial SpA',
    cantidad: 1, unidad: 'un', estadoSolicitud: 'AUTORIZADO',
    registradoById: U_MECANICO,
  }})
  console.log('✅ Estado: ESPERA_REPUESTO — falta shunt resistor de calibración')

  // ── 9. EN_REPARACION — Día 2: Rigoberto releva a Carlos + llega resistor ─────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'EN_REPARACION', enEsperaRepuesto: false } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'ESPERA_REPUESTO', estadoNuevo: 'EN_REPARACION',
    fechaCambio: diasAtras(1, 9), tiempoEnEstadoMin: 960, usuarioId: U_MECANICO,
    observacion: 'Shunt Resistor llegó. Rigoberto Toledo releva a Carlos Rojas. Reanuda calibración con Felipe.'
  }})

  // Entrega del shunt resistor
  const repShunt = await prisma.repuestoOT.findFirst({ where: { otId: ot.id, descripcion: { contains: 'Shunt' } } })
  if (repShunt) {
    await prisma.repuestoOT.update({ where: { id: repShunt.id }, data: {
      estadoSolicitud: 'ENTREGADO', precioUnit: 89000, total: 89000,
    }})
  }

  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(1, 9),
    horaInicio: '09:00', horaTermino: '12:30',
    personal: [T_RIGOBERTO, 'Felipe Núñez (Especialista externo)'],
    tipoIntervencion: 'CAMBIO_COMPONENTE',
    descripcion: 'Rigoberto Toledo releva a Carlos Rojas (guardia). Shunt Resistor llegó en despacho express a las 08:45. Felipe instala resistor en circuito de calibración. Proceso de calibración con pesos patrones: 0 kg, 2.500 kg, 5.000 kg, 7.500 kg, 10.000 kg. Ajuste de ganancia y offset. Lectura estabilizada en ±0.2% — dentro de tolerancia.',
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(1, 13),
    horaInicio: '13:30', horaTermino: '16:00',
    personal: [T_RIGOBERTO, T_PEDRO, 'Felipe Núñez (Especialista externo)'],
    tipoIntervencion: 'REPARACION',
    descripcion: 'Protección mecánica de cableado: instalación de manguera espiral y sujetadores cada 20 cm para evitar roces futuros. Fijación conector con grapa de seguridad. Prueba funcional con carga real (balde de áridos): pesómetro muestra 3.240 kg — coincide con báscula de referencia (3.255 kg, diferencia 0.5%). Felipe emite certificado de calibración N° PC-2024-0892.',
  }})
  // Mano de obra día 2
  await prisma.manoObraOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, nombre: T_RIGOBERTO, trabajadorId: 'e20e84ff-4acd-4d1f-a934-7a6fb6cb1d4f',
    horasNormales: 8, horasExtra: 0, tarifaNormal: 5200, tarifaExtra: 7800, total: 41600,
  }})
  await prisma.manoObraOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, nombre: T_PEDRO, trabajadorId: '5b82fd95-05dc-441e-a8b9-c715504e94fa',
    horasNormales: 4, horasExtra: 0, tarifaNormal: 3100, tarifaExtra: 0, total: 12400,
  }})
  await prisma.manoObraOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, nombre: 'Felipe Núñez (Especialista externo)',
    horasNormales: 7, horasExtra: 0, tarifaNormal: 18000, tarifaExtra: 0, total: 126000,
  }})
  console.log('✅ Estado: EN_REPARACION día 2 — calibración completada')

  // Compra externa: servicio especialista
  await prisma.repuestoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID,
    descripcion: 'Servicio técnico calibración pesómetro Rice Lake 920i — Pesaje Industrial SpA (2 días)',
    cantidad: 1, unidad: 'un', precioUnit: 380000, total: 380000,
    estadoSolicitud: 'EXTERNO',
  }})

  // ── 10. EN_VALIDACION — Jefe inspecciona, encuentra problema menor ────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'EN_VALIDACION' } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'EN_REPARACION', estadoNuevo: 'EN_VALIDACION',
    fechaCambio: diasAtras(1, 16), tiempoEnEstadoMin: 420, usuarioId: U_MECANICO,
    observacion: 'Reparación terminada. Se solicita validación a jefatura.'
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_JEFE, fechaHora: diasAtras(1, 16),
    personal: ['Rodrigo Méndez'],
    tipoIntervencion: 'INSPECCION',
    descripcion: 'Inspección de validación en terreno. Pesómetro operativo y calibrado (certificado adjunto). OBSERVACIÓN: Se detecta que la manguera espiral no cubre los últimos 15 cm del cable antes del conector — zona expuesta a roce potencial. Se devuelve a reparación para cubrir tramo faltante antes de cerrar.',
    estado: 'EN_VALIDACION',
  }})
  console.log('✅ Estado: EN_VALIDACION — observación menor detectada')

  // ── 11. EN_REPARACION — Corrección rápida ────────────────────────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'EN_REPARACION' } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'EN_VALIDACION', estadoNuevo: 'EN_REPARACION',
    fechaCambio: diasAtras(0, 8), tiempoEnEstadoMin: 960, usuarioId: U_JEFE,
    observacion: 'Corrección menor: extender manguera espiral 15 cm adicionales.'
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_MECANICO, fechaHora: diasAtras(0, 8),
    horaInicio: '08:00', horaTermino: '08:45',
    personal: [T_RIGOBERTO],
    tipoIntervencion: 'REPARACION',
    descripcion: 'Corrección según observación de jefatura: extensión de manguera espiral 20 cm adicionales para cubrir tramo antes del conector. Fijación con 2 sujetadores adicionales. Zona completamente protegida.',
  }})
  await prisma.manoObraOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, nombre: T_RIGOBERTO, trabajadorId: 'e20e84ff-4acd-4d1f-a934-7a6fb6cb1d4f',
    horasNormales: 1, horasExtra: 0, tarifaNormal: 5200, tarifaExtra: 0, total: 5200,
  }})

  // ── 12. EN_VALIDACION — Segunda inspección: OK ────────────────────────────────
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'EN_VALIDACION' } })
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'EN_REPARACION', estadoNuevo: 'EN_VALIDACION',
    fechaCambio: diasAtras(0, 9), tiempoEnEstadoMin: 45, usuarioId: U_MECANICO,
    observacion: 'Corrección terminada. Solicitud de segunda validación.'
  }})
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_JEFE, fechaHora: diasAtras(0, 9),
    personal: ['Rodrigo Méndez'],
    tipoIntervencion: 'INSPECCION',
    descripcion: 'Segunda inspección: corrección aplicada correctamente. Cableado 100% protegido. Se realiza prueba funcional final: pesómetro muestra lectura estable. Certificado de calibración N° PC-2024-0892 archivado. Equipo aprobado para retorno a operación.',
    estado: 'EN_VALIDACION',
  }})
  console.log('✅ Estado: EN_VALIDACION — segunda inspección OK')

  // ── 13. CERRADA ───────────────────────────────────────────────────────────────
  const ahora = new Date()
  await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: {
    estado: 'CERRADA',
    fechaCierre: ahora,
    enEsperaRepuesto: false,
  }})
  await prisma.historialEstadoOT.create({ data: {
    otId: ot.id, faenaId: FAENA_ID, estadoAnterior: 'EN_VALIDACION', estadoNuevo: 'CERRADA',
    fechaCambio: ahora, tiempoEnEstadoMin: 30, usuarioId: U_JEFE,
    observacion: 'OT cerrada. Equipo CF83 retorna a operación.'
  }})
  await prisma.equipo.update({ where: { id: EQUIPO_ID }, data: { estado: 'OPERATIVO' } })
  await prisma.bitacoraOT.create({ data: {
    otId: ot.id, usuarioId: U_JEFE, fechaHora: ahora,
    personal: ['Rodrigo Méndez'],
    tipoIntervencion: 'NOTA',
    descripcion: 'OT CERRADA. CF83 retorna a operación. Resumen: cables pesómetro reemplazados, conector nuevo instalado, celda de carga calibrada (certificado Rice Lake N° PC-2024-0892). Protección mecánica mejorada para evitar recurrencia. Tiempo total de detención: ~6 días. Causa raíz: ausencia de canal protector en cableado original — se recomienda revisar instalación en CF82 y CF84 como medida preventiva.',
    estado: 'CERRADA',
  }})

  console.log('\n✅ CASO COMPLETADO')
  console.log(`   OT #${ot.numeroOt} — CF83 Pesómetro`)
  console.log(`   ID: ${ot.id}`)
  console.log(`   Estados recorridos: PROGRAMADA → ABIERTA → EN_DIAGNOSTICO → DIAGNOSTICADO → REPARACION_PROGRAMADA → LISTO_PARA_REPARAR → EN_REPARACION → ESPERA_REPUESTO → EN_REPARACION → EN_VALIDACION → EN_REPARACION → EN_VALIDACION → CERRADA`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
