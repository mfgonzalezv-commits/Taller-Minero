import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Pencil } from 'lucide-react'

const ROL_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  JEFE_TALLER: 'Jefe de Taller',
  PLANIFICADOR: 'Planificador',
  MECANICO: 'Mecánico',
  BODEGA: 'Bodeguero',
  COMPRAS: 'Compras',
  GERENCIA: 'Gerencia',
}

const ROL_COLOR: Record<string, string> = {
  ADMINISTRADOR: 'bg-purple-100 text-purple-700',
  JEFE_TALLER: 'bg-blue-100 text-blue-700',
  MECANICO: 'bg-orange-100 text-orange-700',
  BODEGA: 'bg-green-100 text-green-700',
  PLANIFICADOR: 'bg-indigo-100 text-indigo-700',
  COMPRAS: 'bg-teal-100 text-teal-700',
  GERENCIA: 'bg-slate-100 text-slate-700',
}

export default async function UsuariosPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const puedeEditar = session.user?.rol === 'ADMINISTRADOR' || session.user?.rol === 'JEFE_TALLER'

  const faena = await prisma.faena.findFirst()
  const usuarios = await prisma.usuario.findMany({
    where: { faenaId: faena?.id },
    include: { tecnico: true },
    orderBy: { nombre: 'asc' },
  })

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
          <Link
            href="/usuarios/nuevo"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Agregar usuario
          </Link>
        </div>

        <div className="rounded-lg bg-white shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Nombre</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rol</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium text-sm">
                        {u.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.nombre}</p>
                        {u.tecnico?.turno && (
                          <p className="text-xs text-slate-400">Turno {u.tecnico.turno}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROL_COLOR[u.rol] ?? 'bg-slate-100 text-slate-600'}`}>
                      {ROL_LABEL[u.rol] ?? u.rol}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {puedeEditar && (
                    <td className="px-5 py-3">
                      <Link href={`/usuarios/${u.id}/editar`} className="flex items-center gap-1 text-xs font-bold hover:opacity-80" style={{ color: 'var(--n-text-lt)' }}>
                        <Pencil size={12} /> Editar
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
