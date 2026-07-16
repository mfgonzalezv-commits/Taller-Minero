'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importarPauta } from '@/actions/mantenimiento'
import { Upload, X, CheckCircle, AlertTriangle } from 'lucide-react'

type Equipo = { id: string; codigo: string; nombre: string }

type FilaParsed = {
  nivel: number
  nombrePlan: string
  descripcion: string
  codigo: string
  cantidad: string
  unidad: string
  error?: string
}

const PLANTILLA = `nivel_horas\tnombre_plan\tdescripcion\tcodigo\tcantidad\tunidad
250\tPM250\tFiltro aceite motor\tLF3000\t1\tun
250\tPM250\tAceite motor 15W40\t\t20\tlt
1000\tPM1000\tFiltro aceite motor\tLF3000\t1\tun
1000\tPM1000\tAceite motor 15W40\t\t20\tlt
1000\tPM1000\tFiltro hidráulico\tHF6551\t2\tun
2000\tPM2000\tFiltro aceite motor\tLF3000\t1\tun
2000\tPM2000\tAceite motor 15W40\t\t20\tlt
2000\tPM2000\tFiltro hidráulico\tHF6551\t2\tun
2000\tPM2000\tCorrea distribución\tCD-4412\t1\tun
2000\tPM2000\tAceite diferencial 80W90\t\t8\tlt`

function parseTSV(texto: string): FilaParsed[] {
  const lineas = texto.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (!lineas.length) return []

  // Detectar si la primera línea es encabezado
  const primeraLinea = lineas[0].toLowerCase()
  const tieneEncabezado = primeraLinea.includes('nivel') || primeraLinea.includes('horas') || primeraLinea.includes('descripcion')
  const datos = tieneEncabezado ? lineas.slice(1) : lineas

  return datos.map((linea, i) => {
    const cols = linea.split('\t')
    const nivel = Number(cols[0]?.trim())
    return {
      nivel: isNaN(nivel) ? 0 : nivel,
      nombrePlan: cols[1]?.trim() || `PM${cols[0]?.trim()}`,
      descripcion: cols[2]?.trim() || '',
      codigo: cols[3]?.trim() || '',
      cantidad: cols[4]?.trim() || '',
      unidad: cols[5]?.trim() || 'un',
      error: isNaN(nivel) || nivel <= 0 ? `Fila ${i + 1}: nivel inválido` : !cols[2]?.trim() ? `Fila ${i + 1}: descripción vacía` : undefined,
    }
  })
}

export default function ImportarPautaForm({ equipos }: { equipos: Equipo[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [equipoId, setEquipoId] = useState('')
  const [cicloNombre, setCicloNombre] = useState('')
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<{ planes: number; tareas: number } | null>(null)
  const [abierto, setAbierto] = useState(false)

  const filas = texto.trim() ? parseTSV(texto) : []
  const filasValidas = filas.filter(f => !f.error)
  const filasConError = filas.filter(f => f.error)
  const niveles = [...new Set(filasValidas.map(f => f.nivel))].sort((a, b) => a - b)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!equipoId) return setError('Selecciona un equipo')
    if (!cicloNombre.trim()) return setError('Ingresa el nombre del ciclo')
    if (!filasValidas.length) return setError('No hay filas válidas para importar')

    startTransition(async () => {
      try {
        const res = await importarPauta({
          equipoId,
          cicloNombre,
          filas: filasValidas.map(f => ({
            nivel: f.nivel,
            nombrePlan: f.nombrePlan,
            descripcion: f.descripcion,
            codigo: f.codigo || undefined,
            cantidad: f.cantidad ? Number(f.cantidad) : undefined,
            unidad: f.unidad || undefined,
          })),
        })
        setResultado({ planes: res.planes, tareas: res.tareas })
        setTexto(''); setEquipoId(''); setCicloNombre('')
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al importar')
      }
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-opacity hover:opacity-80"
        style={{ backgroundColor: 'var(--n-surface)', border: '2px dashed var(--n-border)', color: 'var(--n-text-lt)' }}
      >
        <Upload size={14} /> Importar pauta desde Excel
      </button>
    )
  }

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <div className="flex items-center justify-between mb-5" style={{ borderBottom: '1px solid var(--n-border)', paddingBottom: '1rem' }}>
        <div className="flex items-center gap-2">
          <Upload size={14} style={{ color: 'var(--n-yellow)' }} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Importar pauta desde Excel</p>
        </div>
        <button onClick={() => setAbierto(false)} style={{ color: 'var(--n-text-lt)' }}><X size={14} /></button>
      </div>

      {resultado ? (
        <div className="text-center py-4">
          <CheckCircle size={32} className="mx-auto mb-3" style={{ color: '#4ade80' }} />
          <p className="font-bold text-white">¡Pauta importada!</p>
          <p className="text-sm mt-1" style={{ color: 'var(--n-text-lt)' }}>
            {resultado.planes} niveles de mantención · {resultado.tareas} tareas
          </p>
          <button onClick={() => setResultado(null)} className="mt-4 n-btn-ghost text-xs">Importar otra pauta</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="n-label">Equipo *</label>
              <select value={equipoId} onChange={e => setEquipoId(e.target.value)} required className="n-input">
                <option value="">Seleccionar...</option>
                {equipos.map(e => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="n-label">Nombre del ciclo *</label>
              <input type="text" value={cicloNombre} onChange={e => setCicloNombre(e.target.value)} placeholder="Ej: PM CAT 797-F" className="n-input" required />
            </div>
          </div>

          {/* Instrucciones */}
          <div className="rounded-lg p-3 text-xs space-y-1.5" style={{ backgroundColor: 'var(--n-bg)', border: '1px solid var(--n-border)' }}>
            <p className="font-bold" style={{ color: 'var(--n-yellow)' }}>Cómo usar:</p>
            <p style={{ color: 'var(--n-text-lt)' }}>1. Abre tu planilla Excel con la pauta de mantención</p>
            <p style={{ color: 'var(--n-text-lt)' }}>2. Organiza las columnas en este orden: <span className="text-white font-medium">nivel_horas | nombre_plan | descripcion | codigo | cantidad | unidad</span></p>
            <p style={{ color: 'var(--n-text-lt)' }}>3. Selecciona todas las filas (con o sin encabezado) y copia con Ctrl+C</p>
            <p style={{ color: 'var(--n-text-lt)' }}>4. Pega aquí abajo con Ctrl+V</p>
            <button type="button" onClick={() => setTexto(PLANTILLA)} className="text-xs font-bold mt-1" style={{ color: 'var(--n-yellow)' }}>
              → Cargar datos de ejemplo
            </button>
          </div>

          <div>
            <label className="n-label">Datos pegados desde Excel *</label>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={8}
              placeholder="Pega aquí tu planilla (Ctrl+V)..."
              className="n-input resize-y font-mono text-xs"
              style={{ minHeight: 160 }}
            />
          </div>

          {/* Preview */}
          {filas.length > 0 && (
            <div className="rounded-lg overflow-hidden text-xs" style={{ border: '1px solid var(--n-border)' }}>
              <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: 'var(--n-bg)', borderBottom: '1px solid var(--n-border)' }}>
                <span className="font-bold text-white">Vista previa — {filasValidas.length} filas válidas · {niveles.length} niveles: {niveles.map(n => `${n}h`).join(', ')}</span>
                {filasConError.length > 0 && (
                  <span className="flex items-center gap-1 font-bold" style={{ color: 'var(--n-red)' }}>
                    <AlertTriangle size={11} /> {filasConError.length} con error
                  </span>
                )}
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--n-bg)' }}>
                      {['Nivel (h)', 'Plan', 'Descripción', 'Código', 'Cant.', 'Unidad'].map(h => (
                        <th key={h} className="px-3 py-1.5 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 50).map((f, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--n-border)', backgroundColor: f.error ? 'rgba(229,9,20,0.05)' : 'transparent' }}>
                        <td className="px-3 py-1.5 font-bold" style={{ color: f.error ? 'var(--n-red)' : 'var(--n-yellow)' }}>{f.nivel || '?'}</td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--n-text-mid)' }}>{f.nombrePlan}</td>
                        <td className="px-3 py-1.5 text-white">{f.descripcion || <span style={{ color: 'var(--n-red)' }}>vacío</span>}</td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--n-text-lt)' }}>{f.codigo || '—'}</td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--n-text-lt)' }}>{f.cantidad || '—'}</td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--n-text-lt)' }}>{f.unidad}</td>
                      </tr>
                    ))}
                    {filas.length > 50 && (
                      <tr><td colSpan={6} className="px-3 py-1.5 text-center" style={{ color: 'var(--n-text-lt)' }}>... y {filas.length - 50} filas más</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-medium" style={{ color: 'var(--n-red)' }}>{error}</p>}

          <button
            type="submit"
            disabled={isPending || !filasValidas.length}
            className="n-btn-primary w-full"
          >
            {isPending ? 'Importando...' : `Importar ${filasValidas.length} tareas en ${niveles.length} niveles`}
          </button>
        </form>
      )}
    </div>
  )
}
