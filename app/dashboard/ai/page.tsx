'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { MetricCard } from '@/components/ui/metric-card'
import { RiskGauge } from '@/components/ui/risk-gauge'
import { Lock } from 'lucide-react'
import { useRoleHint } from '@/lib/hooks/use-role-hint'

const PLAN_STATUSES = ['draft', 'approved', 'in_progress', 'completed', 'rejected'] as const

export default function AIPage() {
  const queryClient = useQueryClient()
  const [riskAppetite, setRiskAppetite] = useState('moderate')
  const [timeline, setTimeline] = useState('30')
  const t = useTranslations('ai')
  const format = useFormatter()
  const { can, hint, roleName, loading: roleLoading } = useRoleHint()
  const canAnalyze = can('analyst')
  const canApprove = can('ciso')
  const statusLabel = (status: string) => (PLAN_STATUSES as readonly string[]).includes(status) ? t(`planStatus.${status as typeof PLAN_STATUSES[number]}`) : status
  const levelLabel = (v: string) => ['low', 'medium', 'high'].includes(String(v).toLowerCase()) ? t(`levels.${String(v).toLowerCase() as 'low'}`) : v

  const { data: plansData } = useQuery({
    queryKey: ['ai', 'plans'],
    queryFn: async () => {
      const res = await fetch('/api/ai/plans')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timelineDays: Number(timeline),
          riskAppetite,
        }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'plans'] }),
  })

  const approveMutation = useMutation({
    mutationFn: async ({ planId, action }: { planId: string; action: string }) => {
      const res = await fetch('/api/ai/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, action }),
      })
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai', 'plans'] }),
  })

  const plans = plansData?.plans || []
  const latestPlan = plans[0]

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>

      {/* Analysis trigger */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('generateNew')}</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="ai-timeline" className="block text-xs text-[var(--text-secondary)] mb-1">{t('timelineDays')}</label>
            <input
              id="ai-timeline"
              type="number"
              min={1}
              max={365}
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm w-24 bg-[var(--bg-primary)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label htmlFor="ai-risk-appetite" className="block text-xs text-[var(--text-secondary)] mb-1">{t('riskAppetite')}</label>
            <select
              id="ai-risk-appetite"
              value={riskAppetite}
              onChange={(e) => setRiskAppetite(e.target.value)}
              className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)]"
            >
              <option value="conservative">{t('conservative')}</option>
              <option value="moderate">{t('moderate')}</option>
              <option value="aggressive">{t('aggressive')}</option>
            </select>
          </div>
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || !canAnalyze}
            title={canAnalyze ? undefined : hint('analyst')}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-info)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!canAnalyze && <Lock size={14} aria-hidden="true" />}
            {analyzeMutation.isPending ? t('analyzing') : t('generateAnalysis')}
          </button>
        </div>
        {!roleLoading && !canAnalyze && (
          <p className="text-xs mt-2 text-[var(--text-secondary)]">{t('analyzeRequires', { role: roleName('analyst') })}</p>
        )}
        {analyzeMutation.isError && (
          <p className="text-sm mt-2 text-[var(--text-primary)]" role="alert">{t('analysisFailed')}</p>
        )}
      </div>

      {/* Latest plan */}
      {latestPlan && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label={t('projectedReduction')}
              value={format.number((latestPlan.projectedRiskReduction || 0) / 100, { style: 'percent' })}
              color="green"
            />
            <MetricCard
              label={t('recommendedActions')}
              value={(latestPlan.rankedActions as any[])?.length || 0}
              color="blue"
            />
            <MetricCard
              label={t('quickWins')}
              value={(latestPlan.quickWins as any[])?.length || 0}
              color="green"
            />
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">
                {t('latestAnalysis')} — <span className="font-semibold text-[var(--text-primary)]">{statusLabel(latestPlan.status)}</span>
              </h3>
              {latestPlan.status === 'draft' && !roleLoading && !canApprove && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <Lock size={12} aria-hidden="true" />{t('approveRequires', { role: roleName('ciso') })}
                </p>
              )}
              {latestPlan.status === 'draft' && canApprove && (
                <div className="flex gap-2">
                  <button
                    onClick={() => approveMutation.mutate({ planId: latestPlan.id, action: 'approved' })}
                    disabled={approveMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 bg-green-700 disabled:opacity-50"
                  >
                    {t('approvePlan')}
                  </button>
                  <button
                    onClick={() => approveMutation.mutate({ planId: latestPlan.id, action: 'rejected' })}
                    disabled={approveMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border text-[var(--text-primary)] disabled:opacity-50"
                    style={{ borderColor: 'var(--color-critical)' }}
                  >
                    {t('reject')}
                  </button>
                </div>
              )}
            </div>

            <p className="text-sm text-[var(--text-secondary)] mb-6" dir="auto">{latestPlan.executiveSummary}</p>

            {/* Ranked actions */}
            <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('recommendedActions')}</h4>
            <div className="space-y-3 mb-6">
              {(latestPlan.rankedActions as any[] || []).map((action: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-info-bg)] text-xs font-bold flex items-center justify-center text-[var(--text-primary)]">
                    {action.priority || i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]" dir="auto">{action.description}</p>
                    {action.justification && (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5" dir="auto">{action.justification}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1">
                      {action.effort && (
                        <span className="text-xs text-[var(--text-secondary)]">{t('effort')}: <bdi>{levelLabel(action.effort)}</bdi></span>
                      )}
                      {action.impact && (
                        <span className="text-xs text-[var(--text-secondary)]">{t('impact')}: <bdi>{levelLabel(action.impact)}</bdi></span>
                      )}
                      {action.estimatedRiskReduction && (
                        <span className="text-xs text-[var(--text-primary)]">{t('riskReduction', { value: action.estimatedRiskReduction })}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick wins */}
            {(latestPlan.quickWins as any[] || []).length > 0 && (
              <>
                <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('quickWins')}</h4>
                <div className="space-y-2">
                  {(latestPlan.quickWins as any[]).map((win: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-[var(--color-low-bg)] rounded-lg">
                      <span style={{ color: 'var(--color-low)' }} aria-hidden="true">&#10003;</span>
                      <p className="text-sm text-[var(--text-primary)]" dir="auto">{win.description || win.action}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Historical plans */}
      {plans.length > 1 && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('historicalPlans')}</h3>
          <div className="space-y-2">
            {plans.slice(1).map((plan: any) => (
              <div key={plan.id} className="flex items-center justify-between p-3 border border-[var(--border-default)] rounded-lg">
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">{format.dateTime(new Date(plan.generatedAt), { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1" dir="auto">{plan.executiveSummary}</p>
                </div>
                <span className="shrink-0 text-xs px-2 py-1 rounded-full font-medium border text-[var(--text-primary)]" style={{
                  borderColor: plan.status === 'approved' ? 'var(--color-low)' :
                    plan.status === 'rejected' ? 'var(--color-critical)' :
                    'var(--border-hover)'
                }}>
                  {statusLabel(plan.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
