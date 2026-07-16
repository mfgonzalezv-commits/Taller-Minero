'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props {
  data: { estado: string; count: number; color: string }[]
}

export function GraficoGestionTaller({ data }: Props) {
  return (
    <div className="rounded-xl p-5 h-full" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <h3 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--n-text-lt)' }}>Gestión taller — OTs por estado</h3>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fill: 'var(--n-text-lt)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="estado"
            tick={{ fill: 'var(--n-text-mid)', fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--n-card)', border: '1px solid var(--n-border)', borderRadius: 6, color: 'white', fontSize: 13 }}
            formatter={(v: number) => [`${v} OTs`, '']}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
