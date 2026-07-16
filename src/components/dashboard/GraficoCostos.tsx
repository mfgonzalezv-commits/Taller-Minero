'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props {
  data: { codigo: string; costo: number }[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export function GraficoCostos({ data }: Props) {
  const max = Math.max(...data.map((d) => d.costo), 1)

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <h3 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--n-text-lt)' }}>Costos por detención</h3>
      {data.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--n-text-lt)' }}>Sin datos de costo</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(data.length * 38, 80)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="codigo"
              tick={{ fill: 'var(--n-text-mid)', fontSize: 12, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--n-card)', border: '1px solid var(--n-border)', borderRadius: 6, color: 'white', fontSize: 13 }}
              formatter={(v: number) => [fmt(v), 'Costo detención']}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="costo" radius={[0, 4, 4, 0]} barSize={20}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.costo === max ? 'var(--n-red)' : 'var(--n-yellow)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
