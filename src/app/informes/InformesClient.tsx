'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  getInformeDiario,
  enviarInformeDiario,
  getCompromisos,
  crearCompromiso,
  marcarCompromisoCumplido,
  getDestinatarios,
  agregarDestinatario,
  quitarDestinatario,
} from '@/actions/informes'

type Informe = Awaited<ReturnType<typeof getInformeDiario>>
type Compromiso = Awaited<ReturnType<typeof getCompromisos>>[number]
type Destinatario = Awaited<ReturnType<typeof getDestinatarios>>[number]

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'bg-blue-900/60 text-blue-300',
  CUMPLIDO: 'bg-green-900/60 text-green-300',
  ATRASADO: 'bg-red-900/60 text-red-300',
}

export default function InformesClient({ faenaId }: { rolUsuario: string; faenaId: string }) {
  const router = useRouter()
  const [informe, setInforme] = useState<Informe | null>(null)
  const [compromisos, setCompromisos] = useState<Compromiso[]>([])
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [nuevoCompromiso, setNuevoCompromiso] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')

  const cargar = () => {
    getInformeDiario(faenaId).then(setInforme)
    getCompromisos(faenaId).then(setCompromisos)
    getDestinatarios(faenaId).then(setDestinatarios)
  }
  useEffect(cargar, [faenaId])

  const accion = (fn: () => Promise<unknown>) => {
    setError('')
    startTransition(async () => {
      try { await fn(); cargar(); router.refresh() }
      catch (err) { setError(err instanceof Error ? err.message : 'Error') }
    })
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-6">Informes de gestión</h1>
      {error && <p className="mb-4 text-sm font-bold" style={{ color: '#f87171' }}>{error}</p>}

      {/* Informe diario */}
      <div className="n-card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Informe operacional de hoy</p>
          <button onClick={() => accion(() => enviarInformeDiario(faenaId))} disabled={isPending} className="n-btn-primary text-xs px-3 py-1.5">
            Enviar informe (correo)
          </button>
        </div>
        {informe && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p style={{ color: 'var(--n-text-lt)' }}>Flota</p>
              <p className="font-bold text-white">{informe.flota.operativos}/{informe.flota.total} operativa</p>
            </div>
            <div>
              <p style={{ color: 'var(--n-text-lt)' }}>OT</p>
              <p className="font-bold text-white">{informe.ot.abiertas} abiertas · {informe.ot.atrasadas} atrasadas</p>
            </div>
            <div>
              <p style={{ color: 'var(--n-text-lt)' }}>Bodega</p>
              <p className="font-bold text-white">{informe.bodega.itemsBajoStock} bajo stock</p>
            </div>
          </div>
        )}
        <p className="text-xs mt-3" style={{ color: 'var(--n-text-lt)' }}>
          El envío queda en la bandeja de salida (sin proveedor de correo configurado todavía).
        </p>
      </div>

      {/* Compromisos */}
      <div className="n-card p-5 mb-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>Compromisos de reunión</p>
        <div className="flex gap-2 mb-3">
          <input value={nuevoCompromiso} onChange={e => setNuevoCompromiso(e.target.value)} placeholder="Descripción del compromiso" className="n-input flex-1" />
          <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)} className="n-input" style={{ width: 160 }} />
          <button
            onClick={() => {
              if (!nuevoCompromiso.trim() || !fechaLimite) return
              accion(() => crearCompromiso({ faenaId, descripcion: nuevoCompromiso, fechaLimite }))
              setNuevoCompromiso(''); setFechaLimite('')
            }}
            disabled={isPending}
            className="n-btn-primary text-xs px-3"
          >
            Agregar
          </button>
        </div>
        <div className="space-y-2">
          {compromisos.map(c => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <div>
                <span className={`rounded px-2 py-0.5 text-xs font-bold mr-2 ${ESTADO_COLOR[c.estado]}`}>{c.estado}</span>
                <span style={{ color: 'var(--n-text)' }}>{c.descripcion}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--n-text-lt)' }}>vence {new Date(c.fechaLimite).toLocaleDateString('es-CL')}</span>
              </div>
              {c.estado !== 'CUMPLIDO' && (
                <button onClick={() => accion(() => marcarCompromisoCumplido(c.id))} className="n-btn-ghost text-xs px-2 py-1">Marcar cumplido</button>
              )}
            </div>
          ))}
          {compromisos.length === 0 && <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Sin compromisos registrados.</p>}
        </div>
      </div>

      {/* Destinatarios */}
      <div className="n-card p-5">
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--n-text-lt)' }}>Destinatarios de esta faena</p>
        <div className="flex gap-2 mb-3">
          <input value={nuevoEmail} onChange={e => setNuevoEmail(e.target.value)} placeholder="correo@ejemplo.cl" className="n-input flex-1" />
          <button
            onClick={() => { if (nuevoEmail.trim()) { accion(() => agregarDestinatario(faenaId, 'DIARIO', nuevoEmail)); setNuevoEmail('') } }}
            disabled={isPending}
            className="n-btn-primary text-xs px-3"
          >
            Agregar
          </button>
        </div>
        <div className="space-y-1">
          {destinatarios.map(d => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--n-text)' }}>{d.email} <span className="text-xs" style={{ color: 'var(--n-text-lt)' }}>({d.tipo})</span></span>
              <button onClick={() => accion(() => quitarDestinatario(d.id))} className="n-btn-ghost text-xs px-2 py-1">Quitar</button>
            </div>
          ))}
          {destinatarios.length === 0 && <p className="text-sm" style={{ color: 'var(--n-text-lt)' }}>Sin destinatarios configurados.</p>}
        </div>
      </div>
    </div>
  )
}
