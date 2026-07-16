'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'

interface Props {
  data: { dia: string; pct: number }[]
}

export function GraficoOperatividadSemanal({ data }: Props) {
  const promedio = data.length
    ? Math.round(data.reduce((a, d) => a + d.pct, 0) / data.length)
    : 0

  return (
    <div className="rounded-xl p-5 h-full" style={{ backgroundColor: 'var(--n-surface)', border: '1px solid var(--n-border)' }}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--n-text-lt)' }}>
          Operatividad semanal
        </h3>
        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--n-card)', color: 'var(--n-text-mid)' }}>
          Prom. {promedio}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="30%">
          <XAxis
            dataKey="dia"
            tick={{ fill: 'var(--n-text-mid)', fontSize: 10, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            angle={-35}
            textAnchor="end"
            height={40}
            interval={0}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'var(--n-text-lt)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={36}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--n-card)', border: '1px solid var(--n-border)', borderRadius: 6, color: 'white', fontSize: 13 }}
            formatter={(v: number) => [`${v}%`, 'Operatividad']}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <ReferenceLine y={promedio} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={44}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.pct >= 75 ? 'rgba(76,175,80,0.35)' : entry.pct >= 50 ? 'rgba(255,159,67,0.35)' : 'rgba(229,9,20,0.35)'}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="pct"
            stroke="#FFD100"
            strokeWidth={2.5}
            dot={{ fill: '#FFD100', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#FFD100', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
