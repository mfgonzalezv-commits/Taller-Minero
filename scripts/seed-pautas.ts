// Script local de desarrollo — NO expuesto por HTTP.
// Uso: npm run seed:pautas -- <codigoFaena> <archivoKM.xlsm> <archivoHRS.xlsm>
import { prisma } from '../src/lib/prisma'
import * as xlsx from 'xlsx'
import fs from 'fs'

function parsearMultiplicador(texto: string): number {
  if (texto.includes('x 10.000') || texto.includes('x 10000')) return 10000
  if (texto.includes('x 1.000') || texto.includes('x 1000')) return 1000
  if (texto.includes('[HRS]') || texto.includes('HORAS')) return 1
  return 1
}

function celda(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function accion(v: unknown): 'X' | 'COND' | null {
  const s = celda(v).toUpperCase()
  if (s === 'X') return 'X'
  if (s === 'COND') return 'COND'
  return null
}

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

  let marca = ''
  let modelo = ''
  let codigosRaw = ''

  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const rowStr = rows[r].map(celda).join(' ')
    if (rowStr.includes('Marca:') && rowStr.includes('Modelo')) {
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

  const codigosInternos = codigosRaw
    .split(/[/,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.includes(' ') && s.length < 15)

  const secciones: Array<{ headerRow: number; multiplicador: number; ciclosCols: number[]; ciclosValores: number[] }> = []

  for (let r = 0; r < rows.length; r++) {
    const rowArr = rows[r].map(celda)
    const rowStr = rowArr.join(' ')
    if (rowStr.includes('SISTEMAS O COMPONENTES')) {
      let multiplicador = 1
      for (let rb = r - 1; rb >= Math.max(0, r - 3); rb--) {
        const prevStr = rows[rb].map(celda).join(' ')
        if (prevStr.includes('CICLO') || prevStr.includes('KMS') || prevStr.includes('HRS')) {
          multiplicador = parsearMultiplicador(prevStr)
          break
        }
      }

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

  const todosLosCiclos = [...new Set(secciones.flatMap(s => s.ciclosValores))].sort((a, b) => a - b)

  const items: ItemParseado[] = []

  for (const seccion of secciones) {
    const { headerRow, ciclosCols, ciclosValores } = seccion

    const cantCol = ciclosCols[0] - 1
    let normCol = -1
    let altCol = -1

    const headerRow_arr = rows[headerRow].map(celda)
    for (let c = 1; c < ciclosCols[0]; c++) {
      const v = headerRow_arr[c].toUpperCase()
      if (v.includes('NORMATIV')) normCol = c
      if (v.includes('ALTERNATIV')) altCol = c
    }

    for (let r = headerRow + 1; r < rows.length; r++) {
      const rowArr = rows[r].map(celda)
      const componente = rowArr[0]

      if (!componente || componente.includes('OBSERVACIONES') || componente.startsWith('V°') || componente.startsWith('Nombre')) break
      if (componente.includes('SISTEMAS') || componente.includes('FLUIDOS') || componente.includes('FILTROS')) continue
      if (componente.includes('CICLO PM')) continue

      let normativa = ''
      let alternativo = ''

      if (normCol >= 0) {
        normativa = rowArr[normCol] || ''
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
        let encontraNorm = false
        for (let c = 1; c < cantCol; c++) {
          if (rowArr[c] === normativa && normativa) { encontraNorm = true; continue }
          if (encontraNorm && rowArr[c]) { alternativo = rowArr[c]; break }
        }
      }

      let cantidad: number | null = null
      if (cantCol >= 0 && cantCol < rowArr.length) {
        const cantStr = rowArr[cantCol].replace(',', '.')
        const n = parseFloat(cantStr)
        if (!isNaN(n) && n > 0) cantidad = n
      }

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

async function main() {
  const [codigoFaena, archivoKM, archivoHRS] = process.argv.slice(2)

  if (!codigoFaena || !archivoKM || !archivoHRS) {
    console.error('Uso: npm run seed:pautas -- <codigoFaena> <archivoKM.xlsm> <archivoHRS.xlsm>')
    process.exit(1)
  }

  const faena = await prisma.faena.findUnique({ where: { codigo: codigoFaena } })
  if (!faena) {
    console.error(`No existe una faena con código "${codigoFaena}"`)
    process.exit(1)
  }

  const pautasCreadas: string[] = []
  const errores: string[] = []

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

  console.log(JSON.stringify({ ok: true, pautasCreadas: pautasCreadas.length, vinculadosAEquipos: vinculados, detalle: pautasCreadas, errores }, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
