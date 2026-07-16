'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { actualizarUsuario } from '@/actions/usuarios'
import type { RolUsuario } from '@prisma/client'

const ROLES: { value: RolUsuario; label: string }[] = [
  { value: 'ADMINISTRADOR', label: 'Administrador' },
  { value: 'JEFE_TALLER', label: 'Jefe de Taller' },
  { value: 'PLANIFICADOR', label: 'Planificador' },
  { value: 'MECANICO', label: 'Mecánico' },
  { value: 'BODEGA', label: 'Bodeguero' },
  { value: 'COMPRAS', label: 'Compras' },
  { value: 'GERENCIA', label: 'Gerencia' },
]

const ESPECIALIDADES_OPC = ['Motor', 'Hidráulica', 'Eléctrico', 'Transmisión', 'Chasis', 'Neumático']

type Usuario = {
  id: string; nombre: string; email: string; rol: RolUsuario
  tecnico: { especialidades: string[]; turno: string | null } | null
}

export default function EditarUsuarioForm({ usuario }: { usuario: Usuario }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email)
  const [rol, setRol] = useState<RolUsuario>(usuario.rol)
  const [password, setPassword] = useState('')
  const [especialidades, setEspecialidades] = useState<string[]>(usuario.tecnico?.especialidades ?? [])
  const [turno, setTurno] = useState(usuario.tecnico?.turno ?? '')

  const toggleEsp = (e: string) =>
    setEspecialidades((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        await actualizarUsuario(usuario.id, {
          nombre, email, rol,
          password: password || undefined,
          especialidades: rol === 'MECANICO' ? especialidades : undefined,
          turno: rol === 'MECANICO' ? turno : undefined,
        })
        router.push('/usuarios')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="n-card space-y-5">
      <div>
        <label className="n-label">Nombre completo *</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required className="n-input" />
      </div>

      <div>
        <label className="n-label">Email *</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="n-input" />
      </div>

      <div>
        <label className="n-label">Rol *</label>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRol(r.value)}
              className="rounded-md border py-2 text-xs font-bold transition text-left px-3"
              style={{
                borderColor: rol === r.value ? 'var(--n-yellow)' : 'var(--n-border)',
                color: rol === r.value ? 'var(--n-yellow)' : 'var(--n-text-lt)',
                backgroundColor: rol === r.value ? 'rgba(255,209,0,0.08)' : 'transparent',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {rol === 'MECANICO' && (
        <>
          <div>
            <label className="n-label">Especialidades</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ESPECIALIDADES_OPC.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleEsp(e)}
                  className="rounded px-3 py-1 text-xs font-bold transition"
                  style={{
                    backgroundColor: especialidades.includes(e) ? 'var(--n-yellow)' : 'var(--n-bg)',
                    color: especialidades.includes(e) ? '#1A1A1A' : 'var(--n-text-lt)',
                    border: `1px solid ${especialidades.includes(e) ? 'var(--n-yellow)' : 'var(--n-border)'}`,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="n-label">Turno</label>
            <input type="text" value={turno} onChange={(e) => setTurno(e.target.value)} placeholder="Ej: Día, Noche, A, B..." className="n-input" />
          </div>
        </>
      )}

      <div>
        <label className="n-label">Nueva contraseña <span style={{ color: 'var(--n-text-lt)', fontWeight: 400 }}>(dejar vacío para no cambiar)</span></label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="n-input" />
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--n-red)' }}>{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={() => router.back()} className="n-btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={isPending} className="n-btn-primary flex-1">
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
