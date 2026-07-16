'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) setError('Email o contraseña incorrectos')
    else if (result?.ok) router.push('/dashboard')
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--n-bg)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center gap-3 mb-4"
          >
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-black text-lg"
              style={{ backgroundColor: 'var(--n-red)' }}
            >
              E
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">ERP Faena</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--n-text-mid)' }}>Taller Minero · Faena Norte</p>
        </div>

        {/* Card formulario */}
        <div
          className="rounded-xl p-8"
          style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}
        >
          <h2 className="text-xl font-bold text-white mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--n-text-mid)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@faena.cl"
                className="w-full rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 transition"
                style={{
                  backgroundColor: 'var(--n-card)',
                  border: '1px solid var(--n-border)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--n-text-mid)' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 transition"
                style={{
                  backgroundColor: 'var(--n-card)',
                  border: '1px solid var(--n-border)',
                }}
              />
            </div>

            {error && (
              <div
                className="rounded-lg p-3 text-sm font-medium"
                style={{ backgroundColor: 'rgba(229,9,20,0.15)', color: '#FF6B6B', border: '1px solid rgba(229,9,20,0.3)' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50 mt-2"
              style={{ backgroundColor: 'var(--n-red)' }}
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        {/* Usuarios de prueba */}
        <div
          className="mt-4 rounded-xl p-4 text-xs"
          style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)', color: 'var(--n-text-lt)' }}
        >
          <p className="font-semibold mb-2 text-white">Usuarios de prueba</p>
          <p>admin@faena.cl · jefe@faena.cl</p>
          <p>mecanico1@faena.cl · bodega@faena.cl</p>
          <p className="mt-2 font-medium" style={{ color: 'var(--n-red)' }}>Contraseña: password123</p>
        </div>
      </div>
    </div>
  )
}
