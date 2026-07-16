import { AppShell } from '@/components/layout/AppShell'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ShoppingCart, ExternalLink, Package, AlertTriangle } from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default async function ComprasPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const faena = await prisma.faena.findFirst()

  const [otsEspera, itemsBajoStock] = await Promise.all([
    prisma.ordenTrabajo.findMany({
      where: { faenaId: faena?.id, estado: 'ESPERA_REPUESTO' },
      include: {
        equipo: { select: { codigo: true, nombre: true } },
        repuestos: { orderBy: { createdAt: 'asc' } },
        responsable: { select: { nombre: true } },
      },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.itemBodega.findMany({
      where: { faenaId: faena?.id, activo: true },
      orderBy: { descripcion: 'asc' },
    }).then(items => items.filter(i => Number(i.stockActual) <= Number(i.stockMinimo))),
  ])

  const totalRepuestosNecesarios = otsEspera.reduce(
    (acc, ot) => acc + ot.repuestos.reduce((s, r) => s + Number(r.total), 0),
    0
  )

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">Compras</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--n-text-lt)' }}>
            {otsEspera.length} OTs en espera · {itemsBajoStock.length} ítems bajo stock mínimo
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'OTs bloqueadas', value: otsEspera.length, color: 'var(--n-red)', sub: 'esperando repuesto' },
          { label: 'Items bajo stock', value: itemsBajoStock.length, color: 'var(--n-yellow)', sub: 'necesitan reposición' },
          { label: 'Costo estimado', value: fmt(totalRepuestosNecesarios), color: 'var(--n-text)', sub: 'en repuestos registrados', small: true },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl p-4" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--n-text-lt)' }}>{kpi.label}</p>
            <p className={`font-black leading-none mb-1 ${kpi.small ? 'text-lg' : 'text-3xl'}`} style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs" style={{ color: 'var(--n-text-mid)' }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">

        {/* OTs en espera de repuesto */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <ShoppingCart size={14} color="var(--n-yellow)" />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              OTs en espera de repuesto
            </span>
          </div>

          {otsEspera.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Sin OTs bloqueadas</p>
          ) : (
            otsEspera.map((ot) => (
              <div key={ot.id} style={{ borderBottom: '1px solid var(--n-border)' }}>
                <div className="flex items-start justify-between px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs" style={{ color: 'var(--n-text-lt)' }}>#{ot.numeroOt}</span>
                      <span className="text-sm font-black text-white">{ot.equipo.codigo}</span>
                      <span className="text-xs" style={{ color: 'var(--n-text-mid)' }}>{ot.equipo.nombre}</span>
                    </div>
                    <p className="text-xs truncate mb-2" style={{ color: 'var(--n-text-mid)' }}>{ot.descripcionFalla}</p>

                    {ot.repuestos.length > 0 ? (
                      <div className="space-y-1">
                        {ot.repuestos.map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-xs rounded px-2 py-1" style={{ backgroundColor: 'var(--n-bg)' }}>
                            <span style={{ color: 'var(--n-text-mid)' }}>{r.descripcion}</span>
                            <span className="font-bold text-white ml-2 shrink-0">{Number(r.cantidad)} {r.unidad}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic" style={{ color: 'var(--n-text-lt)' }}>Sin repuestos registrados en la OT</p>
                    )}
                  </div>
                  <Link href={`/ot/${ot.id}`} className="ml-3 mt-0.5 shrink-0 hover:opacity-80" style={{ color: 'var(--n-yellow)' }}>
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Items bajo stock mínimo */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid var(--n-border)' }}>
            <AlertTriangle size={14} color="var(--n-red)" />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
              Items bajo stock mínimo
            </span>
          </div>

          {itemsBajoStock.length === 0 ? (
            <p className="px-5 py-8 text-sm text-center" style={{ color: 'var(--n-text-lt)' }}>Todo el stock en niveles normales</p>
          ) : (
            itemsBajoStock.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--n-border)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Package size={14} className="shrink-0" style={{ color: 'var(--n-text-lt)' }} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{item.descripcion}</p>
                    <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>
                      {item.codigo} · Mín: {Number(item.stockMinimo)} {item.unidad}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-black" style={{ color: Number(item.stockActual) === 0 ? 'var(--n-red)' : 'var(--n-yellow)' }}>
                    {Number(item.stockActual)} {item.unidad}
                  </p>
                  {Number(item.precioRef) > 0 && (
                    <p className="text-xs" style={{ color: 'var(--n-text-lt)' }}>{fmt(Number(item.precioRef))}/u</p>
                  )}
                </div>
              </div>
            ))
          )}

          {itemsBajoStock.length > 0 && (
            <div className="px-5 py-3">
              <Link href="/bodega" className="text-xs font-bold" style={{ color: 'var(--n-yellow)' }}>
                Ir a bodega para registrar entradas →
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
