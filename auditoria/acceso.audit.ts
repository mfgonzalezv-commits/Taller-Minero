// Fase 2: acceso y seguridad. Actores de SIM-02 (y roles bajos de SIM-01) intentan acciones sobre datos ajenos.
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { guardar, probar, resultados, sesionDe } from './helpers'
import { crearUsuario, actualizarUsuario } from '../src/actions/usuarios'
import { asignarTecnico, actualizarDiagnostico, anularOT, cambiarEstadoOT, agregarBitacora, crearOT } from '../src/actions/ot'
import { registrarMovimiento, crearItem } from '../src/actions/bodega'
import { crearReporteFalla } from '../src/actions/fallas'
import { solicitarRepuesto } from '../src/actions/repuestos'
import { actualizarEstadoEquipo, actualizarEquipo, eliminarEquipo } from '../src/actions/equipos'
import { registrarHorometro } from '../src/actions/horometro'
import { getInformeDiario, crearCompromiso } from '../src/actions/informes'
import { aprobarEstadoPago } from '../src/actions/estadoPago'

describe('acceso', () => {
  afterAll(async () => {
    await prisma.tecnico.deleteMany({ where: { usuario: { email: { startsWith: 'audit.' } } } })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: 'audit.' } } })
    guardar('acceso')
  })
  it('matriz de probes', async () => {
    const s1 = await prisma.faena.findUniqueOrThrow({ where: { codigo: 'SIM-01' } })
    const ot1 = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faenaId: s1.id, estado: { notIn: ['CERRADA', 'ANULADA'] } } })
    const eq1 = await prisma.equipo.findFirstOrThrow({ where: { faenaId: s1.id } })
    const it1 = await prisma.itemBodega.findFirstOrThrow({ where: { faenaId: s1.id } })
    const tec1 = await prisma.tecnico.findFirstOrThrow({ where: { faenaId: s1.id } })
    const usr1 = await prisma.usuario.findFirstOrThrow({ where: { faenaId: s1.id, rol: 'MECANICO' } })
    const tec2 = await prisma.tecnico.findFirstOrThrow({ where: { faena: { codigo: 'SIM-02' } } })
    const ot2 = await prisma.ordenTrabajo.findFirstOrThrow({ where: { faena: { codigo: 'SIM-02' } } })
    const S = { jefe2: await sesionDe('jefe2@sim2.local'), plan2: await sesionDe('plan2@sim2.local'), mec2: await sesionDe('mecanico2b@sim2.local'), bod2: await sesionDe('bodega2@sim2.local'), op2: await sesionDe('operador2@sim2.local') }
    let n = 0
    const P = (actor: string, sesion: typeof S.jefe2, accion: string, objetivo: string, esperado: 'BLOQUEADO' | 'PERMITIDO', fn: () => Promise<unknown>) =>
      probar({ id: `ACC-${String(++n).padStart(3, '0')}`, actor, sesion, accion, objetivo, esperado, fn })
    const hoy = new Date().toISOString()
    const X = 'SIM-02→SIM-01'
    const cast = <T,>(v: unknown) => v as T

    // A) Jefe de SIM-02 contra IDs de SIM-01 (cross-faena)
    await P('JEFE_TALLER', S.jefe2, 'asignarTecnico', `${X} OT`, 'BLOQUEADO', () => asignarTecnico(ot1.id, tec1.id))
    await P('JEFE_TALLER', S.jefe2, 'actualizarDiagnostico', `${X} OT`, 'BLOQUEADO', () => actualizarDiagnostico({ otId: ot1.id, diagnostico: 'AUDIT cross-faena' }))
    await P('JEFE_TALLER', S.jefe2, 'anularOT', `${X} OT`, 'BLOQUEADO', () => anularOT(ot1.id, 'AUDIT'))
    await P('JEFE_TALLER', S.jefe2, 'cambiarEstadoOT', `${X} OT`, 'BLOQUEADO', () => cambiarEstadoOT(ot1.id, 'ESPERA_REPUESTO'))
    await P('JEFE_TALLER', S.jefe2, 'agregarBitacora', `${X} OT`, 'BLOQUEADO', () => agregarBitacora(ot1.id, { descripcion: 'AUDIT cross-faena' }))
    await P('JEFE_TALLER', S.jefe2, 'crearOT', `${X} equipo`, 'BLOQUEADO', () => crearOT({ equipoId: eq1.id, descripcionFalla: 'AUDIT cross-faena' }))
    await P('JEFE_TALLER', S.jefe2, 'crearReporteFalla', `${X} equipo`, 'BLOQUEADO', () => crearReporteFalla({ equipoId: eq1.id, descripcion: 'AUDIT cross-faena', riesgoSeguridad: false, detencionSolicitada: false }))
    await P('JEFE_TALLER', S.jefe2, 'actualizarEstadoEquipo', `${X} equipo`, 'BLOQUEADO', () => actualizarEstadoEquipo(eq1.id, cast('DETENIDO')))
    await P('JEFE_TALLER', S.jefe2, 'registrarHorometro', `${X} equipo`, 'BLOQUEADO', () => registrarHorometro(cast({ equipoId: eq1.id, horometro: 99999 })))
    await P('JEFE_TALLER', S.jefe2, 'registrarMovimiento', `${X} ítem`, 'BLOQUEADO', () => registrarMovimiento({ itemId: it1.id, tipo: 'SALIDA', cantidad: 1 }))
    await P('JEFE_TALLER', S.jefe2, 'solicitarRepuesto', `${X} OT`, 'BLOQUEADO', () => solicitarRepuesto(cast({ otId: ot1.id, itemId: it1.id, cantidad: 1 })))
    await P('JEFE_TALLER', S.jefe2, 'getInformeDiario', `${X} faena`, 'BLOQUEADO', () => getInformeDiario(s1.id))
    await P('JEFE_TALLER', S.jefe2, 'crearCompromiso', `${X} faena`, 'BLOQUEADO', () => crearCompromiso(cast({ faenaId: s1.id, descripcion: 'AUDIT', responsable: 'x', fechaCompromiso: hoy })))
    await P('JEFE_TALLER', S.jefe2, 'actualizarUsuario', `${X} usuario`, 'BLOQUEADO', () => actualizarUsuario(usr1.id, { nombre: usr1.nombre, email: usr1.email, rol: usr1.rol }))

    // B) Escalamiento de privilegios
    await P('JEFE_TALLER', S.jefe2, 'crearUsuario rol ADMINISTRADOR', 'SIM-02', 'BLOQUEADO', () => crearUsuario({ nombre: 'AUDIT esc', email: 'audit.esc1@sim2.local', password: 'password123', rol: 'ADMINISTRADOR' }))
    await P('JEFE_TALLER', S.jefe2, 'crearUsuario rol JEFE_TALLER_CENTRAL', 'SIM-02', 'BLOQUEADO', () => crearUsuario({ nombre: 'AUDIT esc', email: 'audit.esc2@sim2.local', password: 'password123', rol: 'JEFE_TALLER_CENTRAL' }))
    const u2 = await prisma.usuario.findUniqueOrThrow({ where: { email: 'mecanico2b@sim2.local' } })
    await P('JEFE_TALLER', S.jefe2, 'actualizarUsuario → PLANIFICADOR_CENTRAL', 'usuario SIM-02', 'BLOQUEADO', () => actualizarUsuario(u2.id, { nombre: u2.nombre, email: u2.email, rol: 'PLANIFICADOR_CENTRAL' }))
    for (const [k, s] of [['PLANIFICADOR', S.plan2], ['MECANICO', S.mec2], ['BODEGA', S.bod2], ['OPERADOR', S.op2]] as const)
      await P(k, s, 'crearUsuario rol ADMINISTRADOR', 'SIM-02', 'BLOQUEADO', () => crearUsuario({ nombre: 'AUDIT esc', email: `audit.${k}@sim2.local`, password: 'password123', rol: 'ADMINISTRADOR' }))

    // C) Roles bajos sobre acciones sensibles en su propia faena
    for (const [k, s] of [['OPERADOR', S.op2], ['BODEGA', S.bod2], ['MECANICO', S.mec2]] as const) {
      await P(k, s, 'anularOT', 'propia faena', 'BLOQUEADO', () => anularOT(ot2.id, 'AUDIT rol bajo'))
      await P(k, s, 'cambiarEstadoOT CERRADA', 'propia faena', 'BLOQUEADO', () => cambiarEstadoOT(ot2.id, 'CERRADA'))
      await P(k, s, 'asignarTecnico', 'propia faena', 'BLOQUEADO', () => asignarTecnico(ot2.id, tec2.id))
      await P(k, s, 'aprobarEstadoPago', 'propia faena', 'BLOQUEADO', () => aprobarEstadoPago('00000000-0000-4000-8000-000000000000'))
      await P(k, s, 'crearItem (bodega)', 'propia faena', k === 'BODEGA' ? 'PERMITIDO' : 'BLOQUEADO', () => crearItem({ codigo: `AUD-${k}`, descripcion: 'AUDIT', unidad: 'un', stockActual: 0, stockMinimo: 0, precioRef: 1 }))
    }
    await P('OPERADOR', await sesionDe('operador@sim.local'), 'crearOT', 'propia faena SIM-01', 'BLOQUEADO', () => crearOT({ equipoId: eq1.id, descripcionFalla: 'AUDIT operador' }))

    // D) Reglas nuevas de administración de usuarios y de vínculos entre entidades
    await P('JEFE_TALLER', S.jefe2, 'crearUsuario PLANIFICADOR (rol de su competencia)', 'SIM-02', 'PERMITIDO', () => crearUsuario({ nombre: 'AUDIT ok', email: 'audit.ok1@sim2.local', password: 'password123', rol: 'PLANIFICADOR' }))
    await P('JEFE_TALLER', S.jefe2, 'crearUsuario JEFE_TALLER (par)', 'SIM-02', 'BLOQUEADO', () => crearUsuario({ nombre: 'AUDIT par', email: 'audit.par@sim2.local', password: 'password123', rol: 'JEFE_TALLER' }))
    await P('JEFE_TALLER', S.jefe2, 'autoelevarse a ADMINISTRADOR', 'usuario propio', 'BLOQUEADO', () => actualizarUsuario(S.jefe2.user.id, { nombre: 'Sim2 jefe2', email: 'jefe2@sim2.local', rol: 'ADMINISTRADOR' }))
    const cen = await sesionDe('jefecentral@sim.local'), adm = await sesionDe('admin@sim.local')
    await P('JEFE_TALLER_CENTRAL', cen, 'crearUsuario ADMINISTRADOR', 'SIM-01', 'BLOQUEADO', () => crearUsuario({ nombre: 'AUDIT c', email: 'audit.c1@sim.local', password: 'password123', rol: 'ADMINISTRADOR' }))
    await P('JEFE_TALLER_CENTRAL', cen, 'crearUsuario JEFE_TALLER (rol de faena)', 'SIM-01', 'PERMITIDO', () => crearUsuario({ nombre: 'AUDIT c', email: 'audit.c2@sim.local', password: 'password123', rol: 'JEFE_TALLER' }))
    await P('ADMINISTRADOR', adm, 'crearUsuario PLANIFICADOR_CENTRAL', 'SIM-01', 'PERMITIDO', () => crearUsuario({ nombre: 'AUDIT a', email: 'audit.a1@sim.local', password: 'password123', rol: 'PLANIFICADOR_CENTRAL' }))
    await P('JEFE_TALLER', S.jefe2, 'asignarTecnico con técnico de otra faena', 'OT propia + técnico SIM-01', 'BLOQUEADO', () => asignarTecnico(ot2.id, tec1.id))
    await P('MECANICO', await sesionDe('mecanico1@sim.local'), 'agregarBitacora OT de otra faena', 'SIM-01→SIM-02', 'BLOQUEADO', () => agregarBitacora(ot2.id, { descripcion: 'AUDIT' }))
    await P('MECANICO', S.mec2, 'agregarBitacora OT donde está asignado', 'propia faena', 'PERMITIDO', () => agregarBitacora(ot2.id, { descripcion: 'AUDIT mecánico asignado' }))
    await P('JEFE_TALLER', S.jefe2, 'registrarMovimiento con OT de otra faena', 'ítem propio + OT SIM-01', 'BLOQUEADO', async () => {
      const item2 = await prisma.itemBodega.findFirstOrThrow({ where: { faena: { codigo: 'SIM-02' } } })
      return registrarMovimiento({ itemId: item2.id, tipo: 'ENTRADA', cantidad: 1, otId: ot1.id })
    })
    await P('JEFE_TALLER', S.jefe2, 'actualizarEquipo de otra faena', `${X} equipo`, 'BLOQUEADO', () => actualizarEquipo(eq1.id, { nombre: 'AUDIT', tipo: 'MAQUINARIA' }))
    await P('JEFE_TALLER', S.jefe2, 'eliminarEquipo de otra faena', `${X} equipo`, 'BLOQUEADO', () => eliminarEquipo(eq1.id))
    // Regresión: ninguna prueba con resultado esperado BLOQUEADO puede quedar permitida
    expect(resultados.filter(r => r.hallazgo), 'hallazgos abiertos: ' + JSON.stringify(resultados.filter(r => r.hallazgo).map(r => `${r.id} ${r.accion} ${r.mensaje.slice(0, 60)}`))).toEqual([])
  })
})
