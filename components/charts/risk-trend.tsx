'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useLocale, useTranslations } from 'next-intl'
import { CHART, axisProps, gridProps, AreaGradient, ChartTooltip, ChartFrame } from '@/components/ui/chart-theme'

interface RiskTrendProps {
  data: Array<{ date: string; avgRiskScore: number }>
}

export function RiskTrendChart({ data }: RiskTrendProps) {
  const t = useTranslations('charts')
  const locale = useLocale()

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-[var(--text-secondary)]">
        {t('noTrendData')}
      </div>
    )
  }

  const dayFormat = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const formatDay = (d: unknown) => {
    const date = new Date(`${String(d).slice(0, 10)}T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? String(d) : dayFormat.format(date)
  }

  return (
    <ChartFrame height={256}>
      {/* Time runs left-to-right in both locales; the frame keeps Recharts' text anchoring stable under RTL. */}
      <div dir="ltr" className="h-full w-full" role="img" aria-label={t('riskTrendLabel', { from: formatDay(data[0].date), to: formatDay(data[data.length - 1].date), value: Math.round(data[data.length - 1].avgRiskScore) })}>
        <div className="h-full w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
          {/* Top margin + YAxis width leave room for the "100" tick label (UAT-110). */}
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
            <AreaGradient id="riskTrendFill" color={CHART.accent} />
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} minTickGap={28} tickFormatter={formatDay} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={36} interval={0} {...axisProps} />
            <Tooltip
              cursor={{ stroke: 'var(--border-hover)', strokeWidth: 1 }}
              labelFormatter={formatDay}
              content={<ChartTooltip format={(p: any) => ({ name: t('avgRisk'), value: Math.round(p.value) })} />}
            />
            <Area
              type="monotone"
              dataKey="avgRiskScore"
              stroke={CHART.accent}
              strokeWidth={2}
              fill="url(#riskTrendFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: CHART.accent }}
              name={t('avgRisk')}
            />
          </AreaChart>
        </ResponsiveContainer></div>
      </div>
    </ChartFrame>
  )
}
