import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import EquiposClient from './EquiposClient'
import EquiposPrintButton from './EquiposPrintButton'

const ESTADO_LABEL: Record<string, string> = {
  OPERATIVO: 'OP', DETENIDO: 'DETENIDO', TALLER: 'TALLER', FUERA_DE_SERVICIO: 'F/S',
}

// Mismo orden y agrupación que EquiposClient
const ORDEN_GRUPOS = ['CAMION', 'MAQUINARIA', 'PERFORADORA', 'LIVIANO', 'OTRO']
const GRUPO_LABEL: Record<string, string> = {
  CAMION: 'CAMIONES', MAQUINARIA: 'MAQUINARIA', PERFORADORA: 'MÁQUINAS PERFORADORAS',
  LIVIANO: 'LIVIANOS', OTRO: 'OTROS',
}

function asignarGrupo(nombre: string, tipo: string) {
  if (tipo === 'CAMION')  return 'CAMION'
  if (tipo === 'LIVIANO') return 'LIVIANO'
  if (tipo === 'OTRO')    return 'OTRO'
  if (nombre === 'Máquina Perforadora') return 'PERFORADORA'
  return 'MAQUINARIA'
}

export default async function EquiposPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()
  const equipos = await prisma.equipo.findMany({
    where: { faenaId: faena?.id, activo: true },
    include: {
      ots: {
        where: { estado: { not: 'CERRADA' } },
        select: { id: true, estado: true, prioridad: true },
      },
    },
    orderBy: { codigo: 'asc' },
  })

  const operativos = equipos.filter(e => e.estado === 'OPERATIVO').length
  const detenidos  = equipos.filter(e => e.estado === 'DETENIDO').length
  const enTaller   = equipos.filter(e => e.estado === 'TALLER').length
  const fueraServ  = equipos.filter(e => e.estado === 'FUERA_DE_SERVICIO').length

  // Estructura para impresión: grupo → subcategoría → equipos
  const paraPrint: Record<string, Record<string, typeof equipos>> = {}
  ORDEN_GRUPOS.forEach(g => { paraPrint[g] = {} })
  equipos.forEach(e => {
    const g = asignarGrupo(e.nombre, e.tipo)
    if (!paraPrint[g][e.nombre]) paraPrint[g][e.nombre] = []
    paraPrint[g][e.nombre].push(e)
  })

  const fechaHoy = new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <AppShell>

      {/* ══ VISTA PANTALLA (oculta al imprimir) ══ */}
      <div className="no-print">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">Equipos</h1>
            <div className="flex gap-4 mt-0.5 text-xs font-bold">
              <span style={{ color: '#3DBE7A' }}>{operativos} operativos</span>
              <span style={{ color: 'var(--n-red)' }}>{detenidos} detenidos</span>
              <span style={{ color: '#FF9F43' }}>{enTaller} en taller</span>
              <span style={{ color: '#6B7280' }}>{fueraServ} F/S</span>
            </div>
          </div>
          <div className="flex gap-2">
            <EquiposPrintButton />
            <Link
              href="/equipos/nuevo"
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--n-red)' }}
            >
              <Plus size={15} />
              Agregar equipo
            </Link>
          </div>
        </div>
        <EquiposClient equipos={equipos} />
      </div>

      {/* ══ TABLA IMPRIMIBLE (solo al imprimir) ══ */}
      <div className="hidden print:block">
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: '.05em', textTransform: 'uppercase' }}>
            Estado Operacional — Maquinaria, Equipos y Vehículos
          </div>
          <div style={{ fontSize: 9, marginTop: 4, color: '#444' }}>
            Fecha: {fechaHoy} &nbsp;·&nbsp;
            Total: {equipos.length} equipos &nbsp;·&nbsp;
            Operativos: {operativos} &nbsp;·&nbsp;
            F/S: {fueraServ} &nbsp;·&nbsp;
            Detenidos: {detenidos} &nbsp;·&nbsp;
            En taller: {enTaller}
          </div>
        </div>

        {/* Tabla */}
        <table className="print-equipos-table">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>EQUIPO</th>
              <th style={{ width: '10%' }}>CÓDIGO</th>
              <th style={{ width: '8%'  }}>ESTADO</th>
              <th style={{ width: '8%'  }}>OTs ACTIVAS</th>
              <th style={{ width: '52%' }}>OBSERVACIONES</th>
            </tr>
          </thead>
          <tbody>
            {ORDEN_GRUPOS.map(grupo => {
              const subMap = paraPrint[grupo]
              const subNombres = Object.keys(subMap).sort()
              if (subNombres.length === 0) return null
              const totalGrupo = subNombres.flatMap(n => subMap[n]).length

              return [
                /* Fila cabecera grupo */
                <tr key={`g-${grupo}`} className="grupo-header">
                  <td colSpan={5}>▌ {GRUPO_LABEL[grupo]} — {totalGrupo} equipo{totalGrupo !== 1 ? 's' : ''}</td>
                </tr>,

                /* Subcategorías y equipos */
                ...subNombres.flatMap(nombre => {
                  const lista = subMap[nombre]
                  return [
                    <tr key={`sub-${grupo}-${nombre}`} className="sub-header">
                      <td colSpan={5} style={{ paddingLeft: 16 }}>
                        {nombre}
                        <span style={{ fontWeight: 400, color: '#666', marginLeft: 8 }}>
                          ({lista.length} equipo{lista.length !== 1 ? 's' : ''} · {lista.filter(e => e.estado === 'OPERATIVO').length} OP · {lista.filter(e => e.estado === 'FUERA_DE_SERVICIO').length} F/S{lista.filter(e => e.estado === 'DETENIDO').length > 0 ? ` · ${lista.filter(e => e.estado === 'DETENIDO').length} DET` : ''}{lista.filter(e => e.estado === 'TALLER').length > 0 ? ` · ${lista.filter(e => e.estado === 'TALLER').length} TAL` : ''})
                        </span>
                      </td>
                    </tr>,
                    ...lista.map(e => {
                      const estadoClass =
                        e.estado === 'OPERATIVO' ? 'estado-op' :
                        e.estado === 'FUERA_DE_SERVICIO' ? 'estado-fs' :
                        e.estado === 'TALLER' ? 'estado-tal' : 'estado-det'
                      const otsActivas = e.ots.length
                      const tieneCrit = e.ots.some(o => o.prioridad === 'CRITICA')
                      return (
                        <tr key={e.id}>
                          <td style={{ paddingLeft: 24 }}>{e.nombre}{e.marca ? ` · ${e.marca}` : ''}</td>
                          <td style={{ fontWeight: 700 }}>{e.codigo}</td>
                          <td><span className={estadoClass}>{ESTADO_LABEL[e.estado]}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            {otsActivas > 0 && (
                              <span style={{ color: tieneCrit ? '#8B0000' : '#7a5a00', fontWeight: 700 }}>
                                {otsActivas}{tieneCrit ? ' ⚠' : ''}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 8, color: '#444' }}>
                            {e.ubicacionActual ?? ''}
                          </td>
                        </tr>
                      )
                    }),
                  ]
                }),
              ]
            })}
          </tbody>
        </table>

        {/* Pie de página */}
        <div style={{ marginTop: 10, fontSize: 8, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
          <span>Generado por ERP Faena · {fechaHoy}</span>
          <span>OP = Operativo &nbsp;·&nbsp; F/S = Fuera de servicio</span>
        </div>
      </div>

    </AppShell>
  )
}
