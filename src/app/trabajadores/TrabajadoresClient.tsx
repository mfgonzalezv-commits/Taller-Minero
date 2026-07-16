'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearTrabajador, actualizarTrabajador, eliminarTrabajador } from '@/actions/trabajadores'
import { HardHat, Building2, Plus, Pencil, Trash2, X } from 'lucide-react'

type Trabajador = {
  id: string
  nombre: string
  rut: string | null
  cargo: string | null
  tipo: 'DIRECTO' | 'INDIRECTO'
  sueldoBruto: number
  horasMensuales: number
  tasaLeyesSociales: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const pct = (n: number) => `${Math.round(n * 100)}%`

function costoEmpresaHora(t: Pick<Trabajador, 'sueldoBruto' | 'horasMensuales' | 'tasaLeyesSociales'>): number {
  if (t.horasMensuales === 0) return 0
  return Math.round((t.sueldoBruto * (1 + t.tasaLeyesSociales)) / t.horasMensuales)
}

const TASA_DEFAULT = 0.28

// Cargos predefinidos — el cargo determina el tipo automáticamente
const CARGOS: { label: string; tipo: 'DIRECTO' | 'INDIRECTO' }[] = [
  { label: 'Mecánico diésel',            tipo: 'DIRECTO' },
  { label: 'Mecánico eléctrico',         tipo: 'DIRECTO' },
  { label: 'Mecánico hidráulico',        tipo: 'DIRECTO' },
  { label: 'Mecánico general',           tipo: 'DIRECTO' },
  { label: 'Ayudante mecánico',          tipo: 'DIRECTO' },
  { label: 'Soldador',                   tipo: 'DIRECTO' },
  { label: 'Lubricador',                 tipo: 'DIRECTO' },
  { label: 'Operador de equipos',        tipo: 'DIRECTO' },
  { label: 'Jefe de taller',             tipo: 'INDIRECTO' },
  { label: 'Supervisor de turno',        tipo: 'INDIRECTO' },
  { label: 'Planificador de mantenimiento', tipo: 'INDIRECTO' },
  { label: 'Bodeguero',                  tipo: 'INDIRECTO' },
  { label: 'Administrativo',             tipo: 'INDIRECTO' },
  { label: 'Prevencionista',             tipo: 'INDIRECTO' },
]

function cargoTipo(cargo: string): 'DIRECTO' | 'INDIRECTO' {
  return CARGOS.find(c => c.label === cargo)?.tipo ?? 'DIRECTO'
}

function FormTrabajador({
  inicial,
  onGuardar,
  onCancelar,
  isPending,
}: {
  inicial?: Partial<Trabajador>
  onGuardar: (data: Omit<Trabajador, 'id'>) => void
  onCancelar: () => void
  isPending: boolean
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [rut, setRut] = useState(inicial?.rut ?? '')
  const [cargo, setCargo] = useState(inicial?.cargo ?? '')
  const [sueldoBruto, setSueldoBruto] = useState(inicial?.sueldoBruto?.toString() ?? '')
  const [horasMensuales, setHorasMensuales] = useState(inicial?.horasMensuales?.toString() ?? '180')
  const [tasaLeyesSociales, setTasaLeyesSociales] = useState(
    inicial?.tasaLeyesSociales !== undefined ? Math.round(inicial.tasaLeyesSociales * 100).toString() : '28'
  )

  const tipo = cargo ? cargoTipo(cargo) : (inicial?.tipo ?? 'DIRECTO')

  const preview = sueldoBruto && horasMensuales
    ? costoEmpresaHora({
        sueldoBruto: Number(sueldoBruto),
        horasMensuales: Number(horasMensuales),
        tasaLeyesSociales: Number(tasaLeyesSociales) / 100,
      })
    : 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onGuardar({
      nombre,
      rut: rut || null,
      cargo: cargo || null,
      tipo,
      sueldoBruto: Number(sueldoBruto),
      horasMensuales: Number(horasMensuales),
      tasaLeyesSociales: Number(tasaLeyesSociales) / 100,
    })
  }

  const directos = CARGOS.filter(c => c.tipo === 'DIRECTO')
  const indirectos = CARGOS.filter(c => c.tipo === 'INDIRECTO')

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4" style={{ backgroundColor: 'var(--n-bg)', borderBottom: '1px solid var(--n-border)' }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Nombre *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required className="n-input" placeholder="Juan Pérez" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>RUT</label>
          <input type="text" value={rut} onChange={e => setRut(e.target.value)} className="n-input" placeholder="12.345.678-9" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Cargo *</label>
          <select value={cargo} onChange={e => setCargo(e.target.value)} required className="n-input">
            <option value="">Seleccionar cargo...</option>
            <optgroup label="Mano de obra directa">
              {directos.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </optgroup>
            <optgroup label="Personal indirecto">
              {indirectos.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            </optgroup>
          </select>
          {cargo && (
            <p className="text-xs mt-1 font-bold" style={{ color: tipo === 'DIRECTO' ? 'var(--n-yellow)' : 'var(--n-text-mid)' }}>
              {tipo === 'DIRECTO' ? '⬤ Mano de obra directa' : '⬤ Personal indirecto (overhead)'}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Sueldo bruto *</label>
          <input type="number" value={sueldoBruto} onChange={e => setSueldoBruto(e.target.value)} required min="0" className="n-input" placeholder="1200000" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Horas/mes *</label>
          <input type="number" value={horasMensuales} onChange={e => setHorasMensuales(e.target.value)} required min="1" className="n-input" placeholder="180" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--n-text-lt)' }}>Leyes sociales %</label>
          <input type="number" value={tasaLeyesSociales} onChange={e => setTasaLeyesSociales(e.target.value)} required min="0" max="100" step="0.1" className="n-input" placeholder="28" />
        </div>
      </div>

      {preview > 0 && (
        <div className="flex justify-between text-xs rounded px-3 py-2" style={{ backgroundColor: 'var(--n-surface)' }}>
          <span style={{ color: 'var(--n-text-lt)' }}>
            {fmt(Number(sueldoBruto))} × (1 + {tasaLeyesSociales}%) ÷ {horasMensuales} h
          </span>
          <span className="font-black" style={{ color: 'var(--n-yellow)' }}>
            {fmt(preview)}/hr costo empresa
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="n-btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={isPending} className="n-btn-primary flex-1">
          {isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

export default function TrabajadoresClient({
  trabajadores: inicial,
  tasaOverhead,
}: {
  trabajadores: Trabajador[]
  tasaOverhead: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  const directos = inicial.filter(t => t.tipo === 'DIRECTO')
  const indirectos = inicial.filter(t => t.tipo === 'INDIRECTO')

  const costoIndirectoTotal = indirectos.reduce(
    (acc, t) => acc + t.sueldoBruto * (1 + t.tasaLeyesSociales), 0
  )
  const horasDirectasTotal = directos.reduce((acc, t) => acc + t.horasMensuales, 0)

  const handleCrear = (data: Omit<Trabajador, 'id'>) => {
    startTransition(async () => {
      await crearTrabajador({ ...data, tasaLeyesSociales: data.tasaLeyesSociales })
      setMostrarForm(false)
      router.refresh()
    })
  }

  const handleActualizar = (id: string, data: Omit<Trabajador, 'id'>) => {
    startTransition(async () => {
      await actualizarTrabajador(id, data)
      setEditando(null)
      router.refresh()
    })
  }

  const handleEliminar = (id: string) => {
    startTransition(async () => {
      await eliminarTrabajador(id)
      router.refresh()
    })
  }

  const GrupoTrabajadores = ({
    tipo,
    lista,
  }: {
    tipo: 'DIRECTO' | 'INDIRECTO'
    lista: Trabajador[]
  }) => (
    <div className="rounded-xl overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      {/* Cabecera */}
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
        {tipo === 'DIRECTO'
          ? <HardHat size={14} style={{ color: 'var(--n-yellow)' }} />
          : <Building2 size={14} style={{ color: 'var(--n-text-mid)' }} />
        }
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
          {tipo === 'DIRECTO' ? 'Mano de obra directa' : 'Personal indirecto'}
        </p>
        <span className="text-xs font-bold" style={{ color: 'var(--n-text-mid)' }}>· {lista.length}</span>
      </div>

      {/* Contenido */}
      {lista.length === 0 ? (
        <p className="px-5 py-5 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>
          Sin trabajadores registrados
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--n-border)' }}>
              {['Nombre', 'Sueldo bruto', 'Horas/mes', 'Leyes soc.', 'Costo/hr', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--n-text-lt)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map(t => (
              <>
                <tr key={t.id} style={{ borderBottom: editando === t.id ? 'none' : '1px solid var(--n-border)' }}>
                  <td className="px-4 py-3 font-medium text-white">
                    {t.nombre}
                    <span className="block text-xs" style={{ color: 'var(--n-text-lt)' }}>{t.cargo ?? ''}{t.rut ? ` · ${t.rut}` : ''}</span>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{fmt(t.sueldoBruto)}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{t.horasMensuales} h</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--n-text-mid)' }}>{pct(t.tasaLeyesSociales)}</td>
                  <td className="px-4 py-3 font-bold" style={{ color: 'var(--n-yellow)' }}>{fmt(costoEmpresaHora(t))}/hr</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setEditando(editando === t.id ? null : t.id)} style={{ color: 'var(--n-text-lt)' }} className="hover:opacity-80">
                        {editando === t.id ? <X size={14} /> : <Pencil size={14} />}
                      </button>
                      <button onClick={() => handleEliminar(t.id)} disabled={isPending} style={{ color: 'var(--n-text-lt)' }} className="hover:opacity-80">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                {editando === t.id && (
                  <tr key={`${t.id}-edit`} style={{ borderBottom: '1px solid var(--n-border)' }}>
                    <td colSpan={6} className="p-0">
                      <FormTrabajador
                        inicial={t}
                        onGuardar={(data) => handleActualizar(t.id, data)}
                        onCancelar={() => setEditando(null)}
                        isPending={isPending}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Trabajadores</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--n-text-mid)' }}>Costos de personal y cálculo de overhead</p>
        </div>
        {!mostrarForm && (
          <button onClick={() => setMostrarForm(true)} className="n-btn-primary flex items-center gap-2">
            <Plus size={14} /> Agregar trabajador
          </button>
        )}
      </div>

      {/* KPIs overhead */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Personal directo', value: `${directos.length} personas`, sub: `${horasDirectasTotal} hrs/mes disponibles` },
          { label: 'Costo indirecto mensual', value: fmt(costoIndirectoTotal), sub: `${indirectos.length} personas indirectas` },
          { label: 'Tasa overhead', value: `${fmt(tasaOverhead)}/hr`, sub: 'Por cada hora de trabajo directo', highlight: true },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--n-text-lt)' }}>{k.label}</p>
            <p className="text-xl font-black" style={{ color: k.highlight ? 'var(--n-yellow)' : 'white' }}>{k.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Formulario nuevo */}
      {mostrarForm && (
        <div className="rounded-xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Nuevo trabajador</p>
          </div>
          <FormTrabajador
            onGuardar={handleCrear}
            onCancelar={() => setMostrarForm(false)}
            isPending={isPending}
          />
        </div>
      )}

      {/* Grupos lado a lado */}
      <div className="grid grid-cols-2 gap-4">
        <GrupoTrabajadores tipo="DIRECTO" lista={directos} />
        <GrupoTrabajadores tipo="INDIRECTO" lista={indirectos} />
      </div>

      {/* Explicación overhead */}
      <div className="mt-6 rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>¿Cómo se calcula el overhead?</p>
        <div className="text-sm space-y-1" style={{ color: 'var(--n-text-mid)' }}>
          <p>Costo indirecto mensual <span className="font-bold text-white">{fmt(costoIndirectoTotal)}</span> ÷ Horas directas disponibles <span className="font-bold text-white">{horasDirectasTotal} h</span></p>
          <p>= <span className="font-black" style={{ color: 'var(--n-yellow)' }}>{fmt(tasaOverhead)}/hr</span> que se suma a cada OT por cada hora trabajada</p>
          <p className="text-xs mt-2" style={{ color: 'var(--n-text-lt)' }}>El overhead se recalcula automáticamente en cada OT cuando se registra mano de obra.</p>
        </div>
      </div>
    </div>
  )
}
