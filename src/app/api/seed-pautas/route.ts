import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as xlsx from 'xlsx'
import path from 'path'
import fs from 'fs'

// Parsea el multiplicador de ciclos desde el texto de la cabecera de sección
function parsearMultiplicador(texto: string): number {
  if (texto.includes('x 10.000') || texto.includes('x 10000')) return 10000
  if (texto.includes('x 1.000') || texto.includes('x 1000')) return 1000
  if (texto.includes('[HRS]') || texto.includes('HORAS')) return 1
  return 1
}

// Normaliza un valor de celda a string limpio
function celda(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

// Determina la acción de mantenimiento de una celda
function accion(v: unknown): 'X' | 'COND' | null {
  const s = celda(v).toUpperCase()
  if (s === 'X') return 'X'
  if (s === 'COND') return 'COND'
  return null
}

// Determina categoría del ítem basada en el nombre del componente
function categoriaItem(componente: string): 'FLUIDO' | 'FILTRO' | 'ACCESORIO' {
  const c = componente.toUpperCase()
  if (c.includes('FILTRO') || c.includes('SECADOR') || c.includes('RACOR') || c.includes('SEPARADOR')) return 'FILTRO'
  if (c.includes('ACEITE') || c.includes('LIQUIDO') || c.includes('LÍQUIDO') ||
      c.includes('REFRIGERANTE') || c.includes('COMBUSTIBLE') || c.includes('ADBLUE') ||
      c.includes('GRASA') || c.includes('HIDRÁULICO') || c.includes('HIDRAULICO')) return 'FLUIDO'
  return 'ACCESORIO'
}

interface ItemParseado {
  componente: string
  categoria: 'FLUIDO' | 'FILTRO' | 'ACCESORIO'
  normativa: string
  alternativo: string
  cantidad: number | null
  unidad: string
  ciclosReemplazar: number[]
  ciclosCondicionar: number[]
}

interface PautaParseada {
  nombre: string
  marcaModelo: string
  codigosInternos: string[]
  tipoMetrica: 'KM' | 'HRS'
  ciclosDisponibles: number[]
  items: ItemParseado[]
}

function parsearHoja(ws: xlsx.WorkSheet, tipoMetrica: 'KM' | 'HRS'): PautaParseada | null {
  const rows: unknown[][] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (rows.length < 4) return null

  // Buscar fila con Marca: y Modelo equipo:
  let marca = ''
  let modelo = ''
  let codigosRaw = ''

  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const rowStr = rows[r].map(celda).join(' ')
    if (rowStr.includes('Marca:') && rowStr.includes('Modelo')) {
      // Extraer de las celdas individuales
      for (let c = 0; c < rows[r].length; c++) {
        const v = celda(rows[r][c])
        if (v.startsWith('Marca:')) marca = v.replace('Marca:', '').trim()
        if (v.startsWith('Modelo equipo:') || v.startsWith('Modelo:')) {
          modelo = v.replace(/Modelo equipo:|Modelo:/i, '').trim()
        }
        if (v.startsWith('Código interno:') || v.startsWith('Codigo interno:')) {
          codigosRaw = v.replace(/C[oó]digo interno:/i, '').trim()
        }
      }
      break
    }
  }

  if (!marca && !modelo) return null

  // Extraer códigos internos
  const codigosInternos = codigosRaw
    .split(/[/,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.includes(' ') && s.length < 15)

  // Buscar secciones de ítems (filas con "SISTEMAS O COMPONENTES")
  const secciones: Array<{ headerRow: number; multiplicador: number; ciclosCols: number[]; ciclosValores: number[] }> = []

  for (let r = 0; r < rows.length; r++) {
    const rowArr = rows[r].map(celda)
    const rowStr = rowArr.join(' ')
    if (rowStr.includes('SISTEMAS O COMPONENTES')) {
      // Buscar el multiplicador en filas anteriores
      let multiplicador = 1
      for (let rb = r - 1; rb >= Math.max(0, r - 3); rb--) {
        const prevStr = rows[rb].map(celda).join(' ')
        if (prevStr.includes('CICLO') || prevStr.includes('KMS') || prevStr.includes('HRS')) {
          multiplicador = parsearMultiplicador(prevStr)
          break
        }
      }

      // Encontrar columnas de ciclos en esta fila
      const ciclosCols: number[] = []
      const ciclosValores: number[] = []

      for (let c = 1; c < rowArr.length; c++) {
        const v = rowArr[c].replace(/\./g, '').replace(',', '.')
        const n = parseFloat(v)
        if (!isNaN(n) && n > 0 && n < 10000000) {
          ciclosCols.push(c)
          ciclosValores.push(Math.round(n * multiplicador))
        }
      }

      if (ciclosCols.length > 0) {
        secciones.push({ headerRow: r, multiplicador, ciclosCols, ciclosValores })
      }
    }
  }

  if (secciones.length === 0) return null

  // Todos los ciclos disponibles (unique + sorted)
  const todosLosCiclos = [...new Set(secciones.flatMap(s => s.ciclosValores))].sort((a, b) => a - b)

  // Parsear ítems de cada sección
  const items: ItemParseado[] = []

  for (const seccion of secciones) {
    const { headerRow, ciclosCols, ciclosValores } = seccion

    // Determinar columnas de normativa y alternativo buscando el patrón
    // Col 0 = componente, luego normativa en primera col con valor no vacío, alternativo en siguiente grupo
    // Cantidad = col justo antes del primer ciclo
    const cantCol = ciclosCols[0] - 1
    let normCol = -1
    let altCol = -1

    // Buscar normativa y alternativo buscando en la fila header
    const headerRow_arr = rows[headerRow].map(celda)
    for (let c = 1; c < ciclosCols[0]; c++) {
      const v = headerRow_arr[c].toUpperCase()
      if (v.includes('NORMATIV')) normCol = c
      if (v.includes('ALTERNATIV')) altCol = c
    }

    // Iterar filas de datos
    for (let r = headerRow + 1; r < rows.length; r++) {
      const rowArr = rows[r].map(celda)
      const componente = rowArr[0]

      // Parar en OBSERVACIONES, VB, o fila vacía después de varios ítems
      if (!componente || componente.includes('OBSERVACIONES') || componente.startsWith('V°') || componente.startsWith('Nombre')) break
      // Ignorar filas que son sub-cabeceras
      if (componente.includes('SISTEMAS') || componente.includes('FLUIDOS') || componente.includes('FILTROS')) continue
      if (componente.includes('CICLO PM')) continue

      // Encontrar normativa: primera celda no vacía después de col 0 hasta cantCol
      let normativa = ''
      let alternativo = ''

      if (normCol >= 0) {
        normativa = rowArr[normCol] || ''
        // Buscar hacia la derecha si está vacía
        if (!normativa) {
          for (let c = normCol; c < (altCol >= 0 ? altCol : cantCol); c++) {
            if (rowArr[c]) { normativa = rowArr[c]; break }
          }
        }
      } else {
        for (let c = 1; c < Math.min(8, cantCol); c++) {
          if (rowArr[c] && !rowArr[c].match(/^\d/)) { normativa = rowArr[c]; break }
        }
      }

      if (altCol >= 0) {
        alternativo = rowArr[altCol] || ''
        if (!alternativo) {
          for (let c = altCol; c < cantCol; c++) {
            if (rowArr[c]) { alternativo = rowArr[c]; break }
          }
        }
      } else {
        // Buscar después de la normativa
        let encontraNorm = false
        for (let c = 1; c < cantCol; c++) {
          if (rowArr[c] === normativa && normativa) { encontraNorm = true; continue }
          if (encontraNorm && rowArr[c]) { alternativo = rowArr[c]; break }
        }
      }

      // Cantidad
      let cantidad: number | null = null
      if (cantCol >= 0 && cantCol < rowArr.length) {
        const cantStr = rowArr[cantCol].replace(',', '.')
        const n = parseFloat(cantStr)
        if (!isNaN(n) && n > 0) cantidad = n
      }

      // Ciclos
      const ciclosReemplazar: number[] = []
      const ciclosCondicionar: number[] = []
      for (let i = 0; i < ciclosCols.length; i++) {
        const col = ciclosCols[i]
        const a = accion(col < rowArr.length ? rows[r][col] : '')
        if (a === 'X') ciclosReemplazar.push(ciclosValores[i])
        else if (a === 'COND') ciclosCondicionar.push(ciclosValores[i])
      }

      if (ciclosReemplazar.length > 0 || ciclosCondicionar.length > 0) {
        items.push({
          componente: componente.trim(),
          categoria: categoriaItem(componente),
          normativa: normativa.trim(),
          alternativo: alternativo.trim(),
          cantidad,
          unidad: 'un',
          ciclosReemplazar,
          ciclosCondicionar,
        })
      }
    }
  }

  if (items.length === 0) return null

  const nombrePauta = `${marca} ${modelo}`.trim()
  return {
    nombre: nombrePauta,
    marcaModelo: nombrePauta.toUpperCase(),
    codigosInternos,
    tipoMetrica,
    ciclosDisponibles: todosLosCiclos,
    items,
  }
}

export async function GET() {
  try {
    const faena = await prisma.faena.findFirst()
    if (!faena) return NextResponse.json({ error: 'No hay faena' }, { status: 400 })

    const downloadsPath = `C:\\Users\\Hp\\Downloads`
    const archivoKM  = path.join(downloadsPath, 'CAT-MT-PG-01 FORM02 KM - CON REGISTRO.xlsm')
    const archivoHRS = path.join(downloadsPath, 'CAT-MT-PG-01 FORM03 HRS- CON REGISTRO.xlsm')

    const pautasCreadas: string[] = []
    const errores: string[] = []

    // Borrar pautas existentes para re-seed limpio
    await prisma.pautaMantenimiento.deleteMany({ where: { faenaId: faena.id } })

    for (const { archivo, metrica } of [
      { archivo: archivoKM, metrica: 'KM' as const },
      { archivo: archivoHRS, metrica: 'HRS' as const },
    ]) {
      if (!fs.existsSync(archivo)) {
        errores.push(`Archivo no encontrado: ${archivo}`)
        continue
      }

      const buf = fs.readFileSync(archivo)
      const wb = xlsx.read(buf, { type: 'buffer' })

      for (const sheetName of wb.SheetNames) {
        if (['ÍNDICE', 'INDICE', 'MUESTRA'].includes(sheetName.toUpperCase().trim())) continue

        try {
          const ws = wb.Sheets[sheetName]
          const pauta = parsearHoja(ws, metrica)
          if (!pauta) {
            errores.push(`${sheetName}: sin datos parseables`)
            continue
          }

          // Crear en BD
          await prisma.pautaMantenimiento.create({
            data: {
              faenaId: faena.id,
              nombre: pauta.nombre,
              marcaModelo: pauta.marcaModelo,
              codigosInternos: pauta.codigosInternos,
              tipoMetrica: pauta.tipoMetrica,
              ciclosDisponibles: pauta.ciclosDisponibles,
              items: {
                create: pauta.items.map((item, idx) => ({
                  componente: item.componente,
                  categoria: item.categoria,
                  normativa: item.normativa || null,
                  alternativo: item.alternativo || null,
                  cantidad: item.cantidad,
                  unidad: item.unidad,
                  ciclosReemplazar: item.ciclosReemplazar,
                  ciclosCondicionar: item.ciclosCondicionar,
                  orden: idx,
                })),
              },
            },
          })

          pautasCreadas.push(`${metrica} · ${sheetName} (${pauta.items.length} ítems, ciclos: ${pauta.ciclosDisponibles.join('/')})`)
        } catch (e) {
          errores.push(`${sheetName}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    // Auto-vincular equipos por código interno
    const equipos = await prisma.equipo.findMany({ where: { faenaId: faena.id, activo: true } })
    const pautas = await prisma.pautaMantenimiento.findMany({
      where: { faenaId: faena.id },
      select: { id: true, codigosInternos: true, nombre: true },
    })

    let vinculados = 0
    for (const equipo of equipos) {
      const match = pautas.find(p => p.codigosInternos.includes(equipo.codigo))
      if (match) {
        await prisma.equipo.update({ where: { id: equipo.id }, data: { pautaId: match.id } })
        vinculados++
      }
    }

    return NextResponse.json({
      ok: true,
      pautasCreadas: pautasCreadas.length,
      vinculadosAEquipos: vinculados,
      detalle: pautasCreadas,
      errores,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
