import { describe, expect, it } from 'vitest'
import path from 'path'
import { aFecha, aNumero, parsearCsv } from '../src/lib/importador/csv'
import { validarCarga, type DatosPlanilla, type Existente, type Hoja } from '../src/lib/importador/validador'
import { fraseConfirmacion, verificarApply } from '../src/lib/importador/guardia'
import { leerPlanillas } from '../src/lib/importador/ejecutar'

const HOY = new Date('2026-09-19T12:00:00Z')
const vacio = (): Existente => ({ faenas: new Map(), usuarios: new Map(), equipos: new Map(), asignaciones: new Map(), items: new Map() })
const EJEMPLO = path.join(__dirname, '..', 'plantillas-carga', 'ejemplo-piloto')

/** Construye las planillas desde texto CSV por hoja (solo las que se pasan). */
function planillas(csv: Partial<Record<Hoja, string>>): DatosPlanilla {
  const d: DatosPlanilla = { encabezados: {}, faenas: [], usuarios: [], equipos: [], asignaciones: [], items_bodega: [], lotes: [] }
  for (const [h, t] of Object.entries(csv) as [Hoja, string][]) { const r = parsearCsv(t); d.encabezados[h] = r.encabezados; (d[h] as unknown[]) = r.filas }
  return d
}
const base = (over: Partial<Record<Hoja, string>> = {}) => planillas({
  faenas: 'codigo,nombre\nPIL-01,Piloto',
  usuarios: 'email,nombre,rol,faena\njefe@x.cl,Jefe,JEFE_TALLER,PIL-01\nmec@x.cl,Mec,MECANICO,PIL-01',
  equipos: 'faena,codigo,nombre,tipo,costo_hora_detencion\nPIL-01,CAM-01,Camión,CAMION,85000',
  asignaciones: 'faena,equipo_codigo,fecha_inicio,modalidad,tarifa,regla_descuento\nPIL-01,CAM-01,2026-06-26,MES,9000000,100%',
  items_bodega: 'faena,codigo,descripcion,stock_actual\nPIL-01,FIL-01,Filtro,10',
  lotes: 'faena,item_codigo,lote_ref,cantidad,costo_unitario,fecha_recepcion\nPIL-01,FIL-01,F-1,10,1000,2026-07-01',
  ...over,
})
const errores = (d: DatosPlanilla, ex = vacio()) => validarCarga(d, ex, 'PIL-01', HOY).errores.map(e => e.mensaje)

describe('lector CSV', () => {
  it('acepta ; con decimales con coma, BOM, comillas y filas de comentario', () => {
    const r = parsearCsv('﻿codigo;nombre;precio\r\n# ayuda;x;y\r\nA-1;"Manguera 1/2"" con; punto";1,5\r\n')
    expect(r.encabezados).toEqual(['codigo', 'nombre', 'precio'])
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0].nombre).toBe('Manguera 1/2" con; punto')
    expect(aNumero(r.filas[0].precio)).toBe(1.5)
  })
  it('una comilla en medio de un campo (pulgadas) es texto normal', () => {
    expect(parsearCsv('a,b\nManguera 1/2",x').filas[0].a).toBe('Manguera 1/2"')
  })
  it('números y fechas inválidos se detectan', () => {
    expect(aNumero('12abc')).toBeNaN(); expect(aNumero('')).toBeNull(); expect(aNumero('1.234,5')).toBe(1234.5); expect(aNumero('1,234.5')).toBe(1234.5); expect(aNumero('18.500')).toBeNaN(); expect(aNumero('1,500')).toBeNaN(); expect(aNumero('18500')).toBe(18500); expect(aNumero('0.5')).toBe(0.5)
    expect(aFecha('2026-02-30')).toBeUndefined(); expect(aFecha('19-09-2026')?.toISOString()).toBe('2026-09-19T00:00:00.000Z'); expect(aFecha('')).toBeNull()
  })
})

describe('planilla de ejemplo del piloto', () => {
  it('es válida en una base vacía y no tiene stock sin lotes', () => {
    const i = validarCarga(leerPlanillas(EJEMPLO), vacio(), 'PIL-01', HOY)
    expect(i.errores).toEqual([])
    expect(i.plan?.items.length).toBe(12)
    for (const it of i.plan!.items) expect(it.lotes.reduce((a, l) => a + l.cantidad, 0) >= 0).toBe(true)
  })
})

describe('validaciones', () => {
  it('base válida', () => { expect(errores(base())).toEqual([]) })
  it('exige columnas obligatorias', () => { expect(errores(base({ equipos: 'faena,codigo,nombre\nPIL-01,A,B' })).join()).toMatch(/columna obligatoria "tipo"/) })
  it('stock sin lotes es error', () => { expect(errores(base({ lotes: 'faena,item_codigo,lote_ref,cantidad,costo_unitario,fecha_recepcion' })).join()).toMatch(/ningún lote/) })
  it('stock distinto de la suma de lotes es error', () => {
    expect(errores(base({ items_bodega: 'faena,codigo,descripcion,stock_actual\nPIL-01,FIL-01,Filtro,12' })).join()).toMatch(/no coincide con la suma/)
  })
  it('lotes sin ítem y stock 0 con lotes son errores', () => {
    expect(errores(base({ items_bodega: 'faena,codigo,descripcion,stock_actual\nPIL-01,OTRO,Otro,0' })).join()).toMatch(/no tienen ítem/)
    expect(errores(base({ items_bodega: 'faena,codigo,descripcion,stock_actual\nPIL-01,FIL-01,Filtro,0' })).join()).toMatch(/declara stock 0 pero tiene lotes/)
  })
  it('valores negativos, lote 0 y fechas futuras son errores', () => {
    const l = (fila: string) => base({ lotes: `faena,item_codigo,lote_ref,cantidad,costo_unitario,fecha_recepcion\n${fila}` })
    expect(errores(l('PIL-01,FIL-01,F-1,-10,1000,2026-07-01')).join()).toMatch(/mayor a 0/)
    expect(errores(l('PIL-01,FIL-01,F-1,10,-5,2026-07-01')).join()).toMatch(/negativo/)
    expect(errores(l('PIL-01,FIL-01,F-1,10,1000,2027-01-01')).join()).toMatch(/futuro/)
    expect(errores(base({ items_bodega: 'faena,codigo,descripcion,stock_actual\nPIL-01,FIL-01,Filtro,-3' })).join()).toMatch(/negativo/)
  })
  it('detecta duplicados en usuarios, equipos, ítems y lotes', () => {
    expect(errores(base({ usuarios: 'email,nombre,rol,faena\na@x.cl,A,JEFE_TALLER,PIL-01\nA@x.cl,A2,MECANICO,PIL-01' })).join()).toMatch(/Correo duplicado/)
    expect(errores(base({ equipos: 'faena,codigo,nombre,tipo\nPIL-01,E1,A,CAMION\nPIL-01,e1,B,CAMION' })).join()).toMatch(/Código de equipo duplicado/)
    expect(errores(base({ items_bodega: 'faena,codigo,descripcion,stock_actual\nPIL-01,FIL-01,F,10\nPIL-01,FIL-01,F2,0' })).join()).toMatch(/ítem duplicado/)
    expect(errores(base({ lotes: 'faena,item_codigo,lote_ref,cantidad,costo_unitario,fecha_recepcion\nPIL-01,FIL-01,F-1,5,1000,2026-07-01\nPIL-01,FIL-01,F-1,5,1000,2026-07-01' })).join()).toMatch(/Lote duplicado/)
  })
  it('roles y tipos inválidos, referencias inexistentes y otra faena', () => {
    expect(errores(base({ usuarios: 'email,nombre,rol,faena\na@x.cl,A,SUPERVISOR,PIL-01' })).join()).toMatch(/Rol inválido/)
    expect(errores(base({ equipos: 'faena,codigo,nombre,tipo\nPIL-01,E1,A,NAVE' })).join()).toMatch(/Tipo inválido/)
    expect(errores(base({ asignaciones: 'faena,equipo_codigo,fecha_inicio,modalidad,tarifa\nPIL-01,NO-EXISTE,2026-06-26,MES,100' })).join()).toMatch(/no existe/)
    expect(errores(base({ equipos: 'faena,codigo,nombre,tipo\nOTRA,E1,A,CAMION' })).join()).toMatch(/solo para "PIL-01"/)
  })
  it('asignaciones: solapes, fechas, tarifa y regla de descuento', () => {
    const a = (filas: string) => base({ asignaciones: `faena,equipo_codigo,fecha_inicio,fecha_termino,modalidad,tarifa,regla_descuento\n${filas}` })
    expect(errores(a('PIL-01,CAM-01,2026-06-26,2026-08-31,MES,100,100%\nPIL-01,CAM-01,2026-08-31,,MES,100,100%')).join()).toMatch(/se solapa/)
    expect(errores(a('PIL-01,CAM-01,2026-06-26,,MES,100,100%\nPIL-01,CAM-01,2026-09-01,,MES,100,100%')).join()).toMatch(/se solapa/) // vigente sin fin
    expect(errores(a('PIL-01,CAM-01,2026-06-26,2026-08-31,MES,100,100%\nPIL-01,CAM-01,2026-09-01,,MES,100,100%'))).toEqual([]) // contiguas sin solape
    expect(errores(a('PIL-01,CAM-01,2026-09-01,2026-08-01,MES,100,100%')).join()).toMatch(/anterior/)
    expect(errores(a('PIL-01,CAM-01,2026-06-26,,MES,0,100%')).join()).toMatch(/mayor a 0/)
    expect(errores(a('PIL-01,CAM-01,2026-06-26,,MES,100,150%')).join()).toMatch(/regla_descuento inválida/)
    expect(errores(a('PIL-01,CAM-01,2026-06-31,,MES,100,100%')).join()).toMatch(/fecha_inicio inválida/)
  })
  it('una asignación se solapa con una ya registrada en la base', () => {
    const ex = vacio()
    ex.equipos.set('PIL-01|CAM-01', { nombre: 'Camión', tipo: 'CAMION', marca: null, modelo: null, patente: null, anio: null, costoHoraDetencion: 85000 })
    ex.asignaciones.set('PIL-01|CAM-01', [{ inicio: new Date('2026-05-01'), fin: null, modalidad: 'MES', tarifa: 1, regla: null, politica: 'DIAS_REALES', contrato: null }])
    expect(errores(base(), ex).join()).toMatch(/se solapa con otra ya registrada/)
  })
  it('advertencias no bloquean: rol central, mecánico sin tarifa, sin regla de descuento', () => {
    const i = validarCarga(base({ usuarios: 'email,nombre,rol,faena\nadm@x.cl,A,ADMINISTRADOR,PIL-01\nmec@x.cl,M,MECANICO,PIL-01', asignaciones: 'faena,equipo_codigo,fecha_inicio,modalidad,tarifa\nPIL-01,CAM-01,2026-06-26,MES,100' }), vacio(), 'PIL-01', HOY)
    expect(i.errores).toEqual([])
    const t = i.advertencias.map(a => a.mensaje).join('|')
    expect(t).toMatch(/rol central/); expect(t).toMatch(/sin tarifa_hora/); expect(t).toMatch(/regla_descuento/); expect(t).toMatch(/ningún JEFE_TALLER/)
  })
})

describe('idempotencia y conflictos con lo existente', () => {
  const existente = (): Existente => {
    const ex = vacio()
    ex.faenas.set('PIL-01', { nombre: 'Piloto', empresa: null, ubicacion: null })
    ex.usuarios.set('jefe@x.cl', { nombre: 'Jefe', rol: 'JEFE_TALLER', faena: 'PIL-01' })
    ex.usuarios.set('mec@x.cl', { nombre: 'Mec', rol: 'MECANICO', faena: 'PIL-01' })
    ex.equipos.set('PIL-01|CAM-01', { nombre: 'Camión', tipo: 'CAMION', marca: null, modelo: null, patente: null, anio: null, costoHoraDetencion: 85000 })
    ex.asignaciones.set('PIL-01|CAM-01', [{ inicio: new Date('2026-06-26'), fin: null, modalidad: 'MES', tarifa: 9000000, regla: '100%', politica: 'DIAS_REALES', contrato: null }])
    ex.items.set('PIL-01|FIL-01', { descripcion: 'Filtro', unidad: 'un', stockActual: 10, stockMinimo: 0, precioRef: 0, lotes: new Map([['F-1', { cantidad: 10, costo: 1000, fecha: new Date('2026-07-01') }]]) })
    return ex
  }
  it('repetir la misma carga = todo "sin cambios", nada nuevo', () => {
    const i = validarCarga(base(), existente(), 'PIL-01', HOY)
    expect(i.errores).toEqual([])
    expect(Object.values(i.nuevos).reduce((a, b) => a + b, 0)).toBe(0)
    expect(i.sinCambios).toMatchObject({ faenas: 1, usuarios: 2, equipos: 1, asignaciones: 1, items_bodega: 1, lotes: 1 })
  })
  it('lo que difiere de lo existente es conflicto y no se modifica', () => {
    expect(errores(base({ usuarios: 'email,nombre,rol,faena\njefe@x.cl,Jefe,PLANIFICADOR,PIL-01' }), existente()).join()).toMatch(/lo difiere/)
    expect(errores(base({ equipos: 'faena,codigo,nombre,tipo,costo_hora_detencion\nPIL-01,CAM-01,Camión,CAMION,99999' }), existente()).join()).toMatch(/lo difiere/)
    expect(errores(base({ lotes: 'faena,item_codigo,lote_ref,cantidad,costo_unitario,fecha_recepcion\nPIL-01,FIL-01,F-1,10,2000,2026-07-01' }), existente()).join()).toMatch(/otra cantidad o costo/)
  })
  it('no se agregan lotes a un ítem que ya existe', () => {
    const d = base({ items_bodega: 'faena,codigo,descripcion,stock_actual\nPIL-01,FIL-01,Filtro,15', lotes: 'faena,item_codigo,lote_ref,cantidad,costo_unitario,fecha_recepcion\nPIL-01,FIL-01,F-1,10,1000,2026-07-01\nPIL-01,FIL-01,F-2,5,1000,2026-08-01' })
    expect(errores(d, existente()).join()).toMatch(/no se agregan en una carga inicial/)
  })
})

describe('guardia de escritura', () => {
  const ok = { apply: true, faena: 'PIL-01', base: 'erp_minera_dev', confirmo: fraseConfirmacion('pil-01', 'erp_minera_dev') }
  it('el dry-run siempre es válido', () => { expect(verificarApply({ apply: false }, 'erp_minera')).toBeNull() })
  it('apply exige faena, base explícita y frase exacta', () => {
    expect(verificarApply(ok, 'erp_minera_dev')).toBeNull()
    expect(verificarApply({ ...ok, faena: undefined }, 'erp_minera_dev')).toMatch(/--faena/)
    expect(verificarApply({ ...ok, base: undefined }, 'erp_minera_dev')).toMatch(/--base/)
    expect(verificarApply({ ...ok, base: 'otra' }, 'erp_minera_dev')).toMatch(/no coincide/)
    expect(verificarApply({ ...ok, confirmo: 'si' }, 'erp_minera_dev')).toMatch(/Confirmación inválida/)
    expect(verificarApply({ ...ok, confirmo: 'CARGAR OTRA EN erp_minera_dev' }, 'erp_minera_dev')).toMatch(/Confirmación inválida/)
  })
  it('en producción no se aplica sin la autorización explícita', () => {
    const prod = { ...ok, base: 'erp_minera', confirmo: fraseConfirmacion('PIL-01', 'erp_minera') }
    expect(verificarApply(prod, 'erp_minera', {})).toMatch(/PRODUCCIÓN no está autorizada/)
    expect(verificarApply(prod, 'erp_minera', { IMPORTADOR_PRODUCCION_AUTORIZADO: 'SI' })).toBeNull()
    expect(verificarApply({ ...prod, simularFalla: true }, 'erp_minera', { IMPORTADOR_PRODUCCION_AUTORIZADO: 'SI' })).toMatch(/simular-falla/)
  })
})
