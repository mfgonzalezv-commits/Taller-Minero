import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ChevronLeft, Printer } from 'lucide-react'
import PrintButton from './PrintButton'

export default async function PautaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ equipoId?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id } = await params
  const { equipoId } = await searchParams

  const [pauta, equipo] = await Promise.all([
    prisma.pautaMantenimiento.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] },
        equipos: { select: { id: true, codigo: true, nombre: true, horometroActual: true, kilometrajeActual: true } },
      },
    }),
    equipoId
      ? prisma.equipo.findUnique({
          where: { id: equipoId },
          select: { id: true, codigo: true, nombre: true, marca: true, modelo: true, anio: true, horometroActual: true, kilometrajeActual: true },
        })
      : null,
  ])

  if (!pauta) notFound()

  const CAT_LABEL: Record<string, string> = {
    FLUIDO: 'Fluidos y lubricantes',
    FILTRO: 'Filtros',
    ACCESORIO: 'Accesorios, correas y otros',
  }

  const fechaHoy = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
  const valorActual = equipo
    ? (pauta.tipoMetrica === 'HRS' ? Number(equipo.horometroActual) : Number(equipo.kilometrajeActual))
    : null
  const unidad = pauta.tipoMetrica === 'HRS' ? 'hrs' : 'km'

  return (
    <>
      {/* Controles pantalla — ocultos al imprimir */}
      <div className="no-print flex items-center justify-between px-6 py-3 border-b" style={{ backgroundColor: 'var(--n-surface)', borderColor: 'var(--n-border)' }}>
        <div className="flex items-center gap-3">
          <Link
            href={equipo ? `/equipos/${equipo.id}` : '/mantenimiento'}
            className="flex items-center gap-1.5 text-xs font-bold transition hover:opacity-80"
            style={{ color: 'var(--n-text-lt)' }}
          >
            <ChevronLeft size={14} /> Volver
          </Link>
          <span style={{ color: 'var(--n-border)' }}>|</span>
          <span className="text-sm font-bold text-white">{pauta.nombre}</span>
          {equipo && (
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,209,0,0.15)', color: 'var(--n-yellow)' }}>
              {equipo.codigo}
            </span>
          )}
        </div>
        <PrintButton />
      </div>

      {/* Contenido imprimible */}
      <div className="pauta-print px-8 py-6 max-w-none" style={{ backgroundColor: 'white', minHeight: '100vh', color: '#1a1a1a' }}>

        {/* Cabecera */}
        <div className="flex items-start justify-between mb-6 pb-4" style={{ borderBottom: '2px solid #1a1a1a' }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#666' }}>Pauta de Mantenimiento Preventivo</p>
            <h1 className="text-2xl font-black uppercase">{pauta.nombre}</h1>
            <p className="text-sm mt-1" style={{ color: '#555' }}>
              Métrica: <strong>{pauta.tipoMetrica}</strong>
              {pauta.codigosInternos.length > 0 && (
                <> · Equipos: <strong>{pauta.codigosInternos.join(', ')}</strong></>
              )}
            </p>
          </div>
          <div className="text-right text-sm" style={{ color: '#555' }}>
            <p>Fecha: <strong>{fechaHoy}</strong></p>
            <p>Ciclos disponibles:</p>
            <p className="font-bold text-base">
              {pauta.ciclosDisponibles.map(c =>
                pauta.tipoMetrica === 'HRS' ? `${c.toLocaleString()} hrs` : `${(c/1000).toFixed(0)}k km`
              ).join(' · ')}
            </p>
          </div>
        </div>

        {/* Info equipo si viene con equipoId */}
        {equipo && (
          <div className="mb-5 p-3 rounded" style={{ backgroundColor: '#f5f5f5', border: '1px solid #ddd' }}>
            <div className="flex gap-8 text-sm">
              <div><span style={{ color: '#666' }}>Equipo: </span><strong>{equipo.codigo} — {equipo.nombre}</strong></div>
              {equipo.marca && <div><span style={{ color: '#666' }}>Marca/Modelo: </span><strong>{equipo.marca} {equipo.modelo ?? ''}</strong></div>}
              {valorActual !== null && valorActual > 0 && (
                <div><span style={{ color: '#666' }}>Lectura actual: </span><strong>{valorActual.toLocaleString()} {unidad}</strong></div>
              )}
            </div>
          </div>
        )}

        {/* Ítems por categoría */}
        {(['FLUIDO', 'FILTRO', 'ACCESORIO'] as const).map(cat => {
          const items = pauta.items.filter(i => i.categoria === cat)
          if (items.length === 0) return null

          return (
            <div key={cat} className="mb-8">
              <h2 className="text-sm font-black uppercase tracking-widest mb-2 px-2 py-1" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>
                {CAT_LABEL[cat]}
              </h2>

              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse', tableLayout: 'auto' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f0f0f0' }}>
                      <th className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ border: '1px solid #ccc', width: '26%' }}>
                        Componente / Descripción
                      </th>
                      <th className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ border: '1px solid #ccc', width: '18%' }}>
                        Normativa / P/N
                      </th>
                      <th className="text-left px-3 py-2 font-bold uppercase tracking-wider" style={{ border: '1px solid #ccc', width: '18%' }}>
                        Alternativo
                      </th>
                      <th className="text-center px-2 py-2 font-bold uppercase tracking-wider" style={{ border: '1px solid #ccc', width: '8%' }}>
                        Cant.
                      </th>
                      {pauta.ciclosDisponibles.map(c => (
                        <th
                          key={c}
                          className="text-center px-2 py-2 font-bold"
                          style={{ border: '1px solid #ccc', whiteSpace: 'nowrap', minWidth: 55 }}
                        >
                          {pauta.tipoMetrica === 'KM'
                            ? `${(c / 1000).toFixed(0)}k`
                            : `${c.toLocaleString()}`}
                          <br />
                          <span style={{ fontSize: 9, fontWeight: 400, color: '#666' }}>{unidad}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td className="px-3 py-2 font-semibold" style={{ border: '1px solid #ddd' }}>{item.componente}</td>
                        <td className="px-3 py-2" style={{ border: '1px solid #ddd', color: '#444', fontSize: 10 }}>
                          {item.normativa || '—'}
                        </td>
                        <td className="px-3 py-2" style={{ border: '1px solid #ddd', color: '#444', fontSize: 10 }}>
                          {item.alternativo || '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-bold" style={{ border: '1px solid #ddd' }}>
                          {item.cantidad ? `${Number(item.cantidad)} ${item.unidad ?? 'un'}` : '—'}
                        </td>
                        {pauta.ciclosDisponibles.map(c => {
                          const cam = item.ciclosReemplazar.includes(c)
                          const rev = item.ciclosCondicionar.includes(c)
                          return (
                            <td key={c} className="text-center px-1 py-2" style={{ border: '1px solid #ddd' }}>
                              {cam && (
                                <span className="font-black text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#d4edda', color: '#155724' }}>
                                  CAM
                                </span>
                              )}
                              {rev && (
                                <span className="font-black text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fff3cd', color: '#856404' }}>
                                  REV
                                </span>
                              )}
                              {!cam && !rev && <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {/* Leyenda + firma */}
        <div className="flex justify-between items-end mt-8 pt-4" style={{ borderTop: '1px solid #ccc' }}>
          <div className="text-xs" style={{ color: '#555' }}>
            <p className="font-bold mb-1">Leyenda:</p>
            <div className="flex gap-4">
              <span>
                <span className="inline-block px-1.5 py-0.5 rounded font-bold mr-1" style={{ backgroundColor: '#d4edda', color: '#155724' }}>CAM</span>
                Cambiar / Reemplazar
              </span>
              <span>
                <span className="inline-block px-1.5 py-0.5 rounded font-bold mr-1" style={{ backgroundColor: '#fff3cd', color: '#856404' }}>REV</span>
                Revisar / Condicionar
              </span>
            </div>
          </div>
          <div className="text-xs text-right" style={{ color: '#555' }}>
            <div className="flex gap-12 mt-4">
              {['Mecánico responsable', 'Jefe de taller'].map(rol => (
                <div key={rol} className="text-center">
                  <div style={{ borderTop: '1px solid #999', paddingTop: 4, marginTop: 24, minWidth: 140 }}>
                    <p>{rol}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Equipos con esta pauta */}
        {pauta.equipos.length > 0 && (
          <div className="mt-6 pt-4 no-print" style={{ borderTop: '1px solid var(--n-border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#666' }}>
              Equipos con esta pauta ({pauta.equipos.length})
            </p>
            <div className="flex gap-2 flex-wrap">
              {pauta.equipos.map(eq => (
                <Link
                  key={eq.id}
                  href={`/pautas/${pauta.id}?equipoId=${eq.id}`}
                  className="text-xs px-2 py-1 rounded font-bold transition hover:opacity-80"
                  style={{ backgroundColor: 'rgba(255,209,0,0.1)', color: '#b8860b', border: '1px solid rgba(255,209,0,0.3)' }}
                >
                  {eq.codigo}
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .pauta-print { padding: 0 !important; }
          body { background: white !important; }
          @page { size: A4 landscape; margin: 15mm; }
        }
      `}</style>
    </>
  )
}
