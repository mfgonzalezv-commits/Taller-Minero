'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props {
  data: { name: string; value: number; color: string }[]
  total: number
  pctOperativo: number
}

export function GraficoFlota({ data, total, pctOperativo }: Props) {
  return (
    <div className="rounded-xl p-5 h-full" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>Operatividad flota</h3>
        <span className="text-2xl font-black" style={{ color: pctOperativo >= 75 ? '#4CAF50' : pctOperativo >= 50 ? '#FF9F43' : 'var(--n-red)' }}>
          {pctOperativo}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--n-card)', border: '1px solid var(--n-border)', borderRadius: 6, color: 'white', fontSize: 13 }}
            formatter={(v: number) => [`${v} equipos`, '']}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-y-1.5 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-xs" style={{ color: 'var(--n-text-mid)' }}>{d.name} <strong style={{ color: 'white' }}>{d.value}</strong></span>
          </div>
        ))}
      </div>
    </div>
  )
}
