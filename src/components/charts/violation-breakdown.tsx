'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useLocale, useTranslations } from 'next-intl'
import { useEnumLabel } from '@/components/ui/enum-label'
import { axisProps, ChartTooltip, CHART } from '@/components/ui/chart-theme'

interface ViolationBreakdownProps {
  byType: Record<string, number>
}

const AXIS_WIDTH = 132 // room for two lines of ~20 characters at 11px
const LINE_CHARS = 20

/** Greedy word-wrap into at most two lines; the second line is ellipsized. */
function wrapLabel(label: string): string[] {
  const words = label.split(/\s+/)
  const lines: string[] = ['']
  for (const word of words) {
    const current = lines[lines.length - 1]
    if (!current) lines[lines.length - 1] = word
    else if ((current + ' ' + word).length <= LINE_CHARS) lines[lines.length - 1] = `${current} ${word}`
    else lines.push(word)
  }
  if (lines.length <= 2) return lines
  const second = lines.slice(1).join(' ')
  return [lines[0], second.length > LINE_CHARS ? `${second.slice(0, LINE_CHARS - 1)}…` : second]
}

function CategoryTick({ x, y, payload, anchor }: { x?: number; y?: number; payload?: { value: string }; anchor: 'start' | 'end' }) {
  const lines = wrapLabel(String(payload?.value ?? ''))
  const offset = anchor === 'end' ? -6 : 6
  return (
    <text x={(x ?? 0) + offset} y={y} textAnchor={anchor} fontSize={11} fill="var(--text-secondary)">
      {lines.map((line, i) => (
        <tspan key={i} x={(x ?? 0) + offset} dy={i === 0 ? (lines.length > 1 ? -4 : 4) : 13}>{line}</tspan>
      ))}
    </text>
  )
}

export function ViolationBreakdown({ byType }: ViolationBreakdownProps) {
  const t = useTranslations('charts')
  const label = useEnumLabel()
  const rtl = useLocale() === 'ar'

  const data = Object.entries(byType)
    .map(([type, count]) => ({ type: label('violationType', type), count: Number(count) }))
    .sort((a, b) => b.count - a.count)

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[var(--text-secondary)] text-sm">
        {t('noViolationData')}
      </div>
    )
  }

  const height = Math.max(220, data.length * 34 + 40)
  const total = data.reduce((sum, d) => sum + d.count, 0)

  return (
    // The SVG is laid out in an LTR frame; in Arabic the category axis moves to the
    // right and the value axis is reversed so bars grow from the reading-start side.
    <div
      dir="ltr"
      style={{ width: '100%', height }}
      role="img"
      aria-label={t('violationBreakdownLabel', { count: total, types: data.map((d) => `${d.type}: ${d.count}`).join(rtl ? '، ' : ', ') })}
    >
      <div className="h-full w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 12, left: 12, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} reversed={rtl} {...axisProps} />
          <YAxis
            type="category"
            dataKey="type"
            orientation={rtl ? 'right' : 'left'}
            width={AXIS_WIDTH}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={<CategoryTick anchor={rtl ? 'start' : 'end'} />}
          />
          <Tooltip cursor={{ fill: 'var(--bg-secondary)' }} content={<ChartTooltip format={(p: any) => ({ name: t('count'), value: p.value })} />} />
          <Bar dataKey="count" fill={CHART.critical} radius={rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]} name={t('count')} barSize={18} />
        </BarChart>
      </ResponsiveContainer></div>
    </div>
  )
}
