'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearUsuario } from '@/actions/usuarios'
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

const ESPECIALIDADES = ['Motor', 'Hidráulica', 'Eléctrico', 'Transmisión', 'Neumáticos', 'Estructuras']

export default function NuevoUsuarioForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<RolUsuario>('MECANICO')
  const [turno, setTurno] = useState('')
  const [especialidades, setEspecialidades] = useState<string[]>([])

  const toggleEsp = (e: string) =>
    setEspecialidades((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault()
    setError('')

    startTransition(async () => {
      try {
        await crearUsuario({
          nombre,
          email,
          password,
          rol,
          especialidades,
          turno: turno || undefined,
        })
        router.push('/usuarios')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear usuario')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-lg bg-white p-6 shadow space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo *</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            placeholder="Juan Pérez"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="juan@faena.cl"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña *</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Mínimo 6 caracteres"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Rol *</label>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRol(r.value)}
                className={`rounded-lg border py-2 px-3 text-sm text-left transition ${
                  rol === r.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rol === 'MECANICO' && (
        <div className="rounded-lg bg-white p-6 shadow space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase">Datos mecánico</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Turno</label>
            <div className="flex gap-3">
              {['Día', 'Noche', 'Rotativo'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTurno(t)}
                  className={`flex-1 rounded-lg border py-2 text-sm transition ${
                    turno === t
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Especialidades</label>
            <div className="flex flex-wrap gap-2">
              {ESPECIALIDADES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleEsp(e)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                    especialidades.includes(e)
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Guardando...' : 'Crear usuario'}
        </button>
      </div>
    </form>
  )
}
