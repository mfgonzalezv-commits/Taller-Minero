// Regresión de seguridad (PR de seguridad): cada acción sensible rechaza a los roles no
// autorizados ANTES de tocar la base de datos. Prisma se simula con un proxy que falla si
// se lo usa: si una acción llega a la base con un rol prohibido, la prueba falla.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const sesion: { current: { user: { id: string; rol: string; faenaId: string } } | null } = { current: null }
vi.mock('@/lib/auth', () => ({ auth: async () => sesion.current }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/prisma', () => {
  const falla = () => { throw new Error('DB_TOCADA: la acción llegó a la base con un rol no autorizado') }
  const modelo = new Proxy({}, { get: () => falla })
  return { prisma: new Proxy({ $transaction: falla }, { get: (t, k) => (k in t ? (t as never)[k] : modelo) }) }
})

import { cambiarEstadoOT, asignarTecnico, agregarBitacora, actualizarDiagnostico, crearOT, actualizarManoObra, actualizarOrigenFalla } from '../src/actions/ot'
import { crearUsuario } from '../src/actions/usuarios'
import { autorizarSolicitud, rechazarSolicitud, entregarSolicitud, agregarRepuesto, eliminarRepuesto } from '../src/actions/repuestos'
import { crearItem, editarItem, registrarMovimiento } from '../src/actions/bodega'
import { crearPlan, generarOT, eliminarPlan } from '../src/actions/mantenimiento'
import { crearEquipo, actualizarEstadoEquipo } from '../src/actions/equipos'
import { agregarManoObra } from '../src/actions/manoObra'
import { aprobarEstadoPago } from '../src/actions/estadoPago'
import { crearInspeccion, generarOTDesdeAlerta } from '../src/actions/inspeccion'
import { cambiarEstadoSR, regularizarCompraDirecta, aprobarCompraDirectaCentral, marcarCompraDirecta, solicitarAprobacionCompra } from '../src/actions/sr'
import { anularEstadoPago, reemplazarEstadoPago } from '../src/actions/estadoPago'
import { solicitarAjusteStock, aprobarAjusteStock } from '../src/actions/bodega'
import { liberarEquipo } from '../src/actions/equipos'
import { proponerVersionPauta, aprobarPauta } from '../src/actions/pautas'

const ID = '00000000-0000-4000-8000-000000000000'
const TODOS = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR', 'MECANICO', 'BODEGA', 'COMPRAS', 'GERENCIA', 'OPERADOR']
const GESTION = ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR']

const casos: { accion: string; permitidos: string[]; llamar: () => Promise<unknown> }[] = [
  { accion: 'asignarTecnico', permitidos: GESTION, llamar: () => asignarTecnico(ID, ID) },
  { accion: 'crearOT', permitidos: GESTION, llamar: () => crearOT({ equipoId: ID, descripcionFalla: 'x' }) },
  { accion: 'actualizarManoObra', permitidos: GESTION, llamar: () => actualizarManoObra(ID, 1) },
  { accion: 'actualizarOrigenFalla', permitidos: GESTION, llamar: () => actualizarOrigenFalla(ID, {}) },
  { accion: 'agregarBitacora', permitidos: [...GESTION, 'MECANICO'], llamar: () => agregarBitacora(ID, { descripcion: 'x' }) },
  { accion: 'actualizarDiagnostico', permitidos: [...GESTION, 'MECANICO'], llamar: () => actualizarDiagnostico({ otId: ID }) },
  { accion: 'autorizarSolicitud', permitidos: GESTION, llamar: () => autorizarSolicitud(ID, ID) },
  { accion: 'rechazarSolicitud', permitidos: GESTION, llamar: () => rechazarSolicitud(ID, ID) },
  { accion: 'eliminarRepuesto', permitidos: GESTION, llamar: () => eliminarRepuesto(ID, ID) },
  { accion: 'entregarSolicitud', permitidos: [...GESTION, 'BODEGA'], llamar: () => entregarSolicitud(ID, ID, { precioUnit: 1 }) },
  { accion: 'agregarRepuesto', permitidos: [...GESTION, 'BODEGA'], llamar: () => agregarRepuesto({ otId: ID, descripcion: 'x', cantidad: 1, unidad: 'un', precioUnit: 1 }) },
  { accion: 'crearItem', permitidos: ['ADMINISTRADOR', 'BODEGA'], llamar: () => crearItem({ codigo: 'x', descripcion: 'x', unidad: 'un', stockActual: 0, stockMinimo: 0, precioRef: 1 }) },
  { accion: 'editarItem', permitidos: ['ADMINISTRADOR', 'BODEGA'], llamar: () => editarItem(ID, { codigo: 'x', descripcion: 'x', unidad: 'un', stockMinimo: 0, precioRef: 1 }) },
  { accion: 'registrarMovimiento (SALIDA)', permitidos: [...GESTION, 'BODEGA'], llamar: () => registrarMovimiento({ itemId: ID, tipo: 'SALIDA', cantidad: 1 }) },
  { accion: 'crearPlan', permitidos: GESTION, llamar: () => crearPlan({ equipoId: ID, nombre: 'x', intervaloHoras: 1 }) },
  { accion: 'generarOT (plan)', permitidos: GESTION, llamar: () => generarOT(ID) },
  { accion: 'eliminarPlan', permitidos: GESTION, llamar: () => eliminarPlan(ID) },
  { accion: 'crearEquipo', permitidos: GESTION, llamar: () => crearEquipo({ codigo: 'x', nombre: 'x', tipo: 'MAQUINARIA' }) },
  { accion: 'actualizarEstadoEquipo', permitidos: GESTION, llamar: () => actualizarEstadoEquipo(ID, 'OPERATIVO') },
  { accion: 'agregarManoObra', permitidos: GESTION, llamar: () => agregarManoObra({ otId: ID, nombre: 'x', horasNormales: 1, horasExtra: 0, tarifaNormal: 1, tarifaExtra: 0 }) },
  { accion: 'aprobarEstadoPago', permitidos: ['ADMINISTRADOR', 'GERENCIA'], llamar: () => aprobarEstadoPago(ID) },
  { accion: 'cambiarEstadoOT', permitidos: [...GESTION, 'MECANICO'], llamar: () => cambiarEstadoOT(ID, 'DIAGNOSTICADO') },
  { accion: 'crearInspeccion', permitidos: [...GESTION, 'MECANICO', 'OPERADOR'], llamar: () => crearInspeccion({ equipoId: ID, plantillaId: ID, turno: 'MAÑANA', resultados: [] }) },
  { accion: 'generarOTDesdeAlerta', permitidos: GESTION, llamar: () => generarOTDesdeAlerta(ID) },
  { accion: 'cambiarEstadoSR', permitidos: [...GESTION, 'BODEGA', 'COMPRAS'], llamar: () => cambiarEstadoSR(ID, 'ENTREGADA') },
  { accion: 'marcarCompraDirecta', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'], llamar: () => marcarCompraDirecta(ID, 'x') },
  { accion: 'regularizarCompraDirecta', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR', 'COMPRAS'], llamar: () => regularizarCompraDirecta(ID, { cotizaciones: ['c'], comprobante: 'f', motivo: 'm', monto: 1 }) },
  { accion: 'aprobarCompraDirectaCentral', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL'], llamar: () => aprobarCompraDirectaCentral(ID) },
  { accion: 'solicitarAprobacionCompra', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER', 'PLANIFICADOR'], llamar: () => solicitarAprobacionCompra(ID, 300000) },
  { accion: 'anularEstadoPago (solo Gerencia)', permitidos: ['GERENCIA'], llamar: () => anularEstadoPago(ID, 'x') },
  { accion: 'reemplazarEstadoPago', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'PLANIFICADOR_CENTRAL'], llamar: () => reemplazarEstadoPago(ID) },
  { accion: 'solicitarAjusteStock', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR', 'BODEGA'], llamar: () => solicitarAjusteStock({ itemId: ID, cantidadNueva: 1, motivo: 'inventario' }) },
  { accion: 'aprobarAjusteStock (solo Jefe Central)', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL'], llamar: () => aprobarAjusteStock(ID) },
  { accion: 'liberarEquipo', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER', 'PLANIFICADOR'], llamar: () => liberarEquipo(ID, 'x') },
  { accion: 'proponerVersionPauta', permitidos: [...GESTION], llamar: () => proponerVersionPauta(ID, { motivo: 'x' }) },
  { accion: 'aprobarPauta (solo Jefe Central)', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL'], llamar: () => aprobarPauta(ID) },
  { accion: 'crearUsuario', permitidos: ['ADMINISTRADOR', 'JEFE_TALLER_CENTRAL', 'JEFE_TALLER'], llamar: () => crearUsuario({ nombre: 'x', email: 'x@x.cl', password: 'x', rol: 'ADMINISTRADOR' }) },
]

describe.each(casos)('$accion', ({ permitidos, llamar }) => {
  beforeEach(() => { sesion.current = null })
  it('sin sesión se rechaza', async () => { await expect(llamar()).rejects.toThrow(/Sin sesión/) })
  for (const rol of TODOS.filter(r => !permitidos.includes(r))) {
    it(`${rol} recibe "Sin permisos" antes de tocar la base`, async () => {
      sesion.current = { user: { id: ID, rol, faenaId: ID } }
      await expect(llamar()).rejects.toThrow(/Sin permisos/)
    })
  }
  for (const rol of permitidos) {
    it(`${rol} supera la validación de rol`, async () => {
      sesion.current = { user: { id: ID, rol, faenaId: ID } }
      // pasa el control de rol y recién ahí llega a la base (simulada) o a otro control de la acción
      await expect(llamar()).rejects.not.toThrow(/Sin permisos para esta acción|Sin sesión/)
    })
  }
})
