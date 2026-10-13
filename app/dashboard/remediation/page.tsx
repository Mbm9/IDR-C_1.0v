'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import {
  Shield, ShieldAlert, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronRight, Loader2, Zap,
} from 'lucide-react'
import { useAppRole } from '@/lib/hooks/use-app-role'

interface RemediationAction {
  priority: number
  actionType: string
  targetIdentityId: string
  targetIdentityName: string
  targetEntitlementId?: string
  description: string
  justification: string
  currentTier: string
  effectiveTier: string
  riskScore: number
  effort: string
  impact: string
}

interface Plan {
  id: string
  status: string
  executiveSummary: string
  rankedActions: RemediationAction[]
  quickWins: RemediationAction[]
  projectedRiskReduction: number
  generatedAt: string
  approvedBy?: string
  approvedAt?: string
  inputParams?: any
}

// Status tones built from theme tokens so they keep AA contrast in light and dark themes.
const tone = (c: string) => `bg-[var(--color-${c}-bg)] text-[color:color-mix(in_srgb,var(--color-${c})_60%,var(--text-primary))]`
const STATUS_STYLES: Record<string, { icon: any; cls: string }> = {
  draft: { icon: Clock, cls: tone('medium') },
  approved: { icon: CheckCircle2, cls: tone('info') },
  completed: { icon: CheckCircle2, cls: tone('low') },
  rejected: { icon: XCircle, cls: tone('critical') },
}

export default function RemediationPage() {
  const t = useTranslations('remediation')
  const tTiers = useTranslations('tiers')
  const tCommon = useTranslations('common')
  const tGate = useTranslations('roleGate')
  const locale = useLocale()
  const { can } = useAppRole()
  // POST /api/remediation requires analyst; approving/rejecting (PUT) requires CISO
  const canGenerate = can('analyst')
  const canDecide = can('ciso')
  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier)
  const queryClient = useQueryClient()
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['remediation-plans'],
    queryFn: async () => {
      const res = await fetch('/api/remediation')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'tier_violations' }),
      })
      if (!res.ok) throw new Error('Failed to generate')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['remediation-plans'] }),
  })

  const approveMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/remediation/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) throw new Error('Failed to approve')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['remediation-plans'] }),
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ planId, reason }: { planId: string; reason: string }) => {
      const res = await fetch(`/api/remediation/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason }),
      })
      if (!res.ok) throw new Error('Failed to reject')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-plans'] })
      setShowRejectDialog(null)
      setRejectReason('')
    },
  })

  const plans: Plan[] = data?.plans || []
  const pendingCount = plans.filter(p => p.status === 'draft').length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-title text-[var(--text-primary)]">
            <ShieldAlert aria-hidden className="inline-block w-6 h-6 me-2 text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))]" />
            {t('title')}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {pendingCount > 0 && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${tone('medium')}`}>
              {t('pendingCount', { count: pendingCount })}
            </span>
          )}
          <button
            onClick={canGenerate ? () => generateMutation.mutate() : undefined}
            disabled={generateMutation.isPending}
            aria-disabled={!canGenerate || undefined}
            title={canGenerate ? undefined : tGate('requiresRole', { role: tGate('roles.analyst') })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-info)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
          >
            {generateMutation.isPending ? (
              <Loader2 aria-hidden className="w-4 h-4 animate-spin" />
            ) : (
              <Zap aria-hidden className="w-4 h-4" />
            )}
            {t('generate')}
          </button>
        </div>
      </div>

      {/* Results of generation */}
      {generateMutation.isSuccess && (
        <div role="status" className="p-4 rounded-lg border border-[var(--color-low)]/30 bg-[var(--color-low-bg)]">
          <p className="text-sm text-[var(--text-primary)]">
            {t('scanComplete', { violations: generateMutation.data.totalViolations ?? 0, actions: generateMutation.data.proposedActions ?? 0 })}
          </p>
        </div>
      )}
      {generateMutation.isError && (
        <div role="alert" className="p-4 rounded-lg border border-[var(--color-critical)]/30 bg-[var(--color-critical-bg)]">
          <p className="text-sm text-[var(--text-primary)]">{t('generateFailed')}</p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-[var(--bg-secondary)] animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-secondary)]">
          <Shield aria-hidden className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{t('emptyTitle')}</p>
          <p className="text-sm mt-1">{canGenerate ? t('emptyHint') : t('emptyHintViewer')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => {
            const style = STATUS_STYLES[plan.status] || STATUS_STYLES.draft
            const Icon = style.icon
            const isExpanded = expandedPlan === plan.id
            const actions = (plan.rankedActions || []) as RemediationAction[]

            return (
              <div
                key={plan.id}
                className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] overflow-hidden"
              >
                {/* Plan Header */}
                <button
                  onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center justify-between gap-2 p-4 text-start hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                    <div className={`p-2 rounded-lg ${style.cls}`}>
                      <Icon aria-hidden className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.cls}`}>
                          {t.has(`statuses.${plan.status}`) ? t(`statuses.${plan.status}`) : plan.status}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {new Date(plan.generatedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-primary)] mt-1 truncate">
                        <bdi>{plan.executiveSummary}</bdi>
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                      <span>{t('actionsCount', { count: actions.length })}</span>
                      <span className="font-medium text-[color:color-mix(in_srgb,var(--color-low)_60%,var(--text-primary))]">{t('riskReduction', { pct: plan.projectedRiskReduction })}</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown aria-hidden className="w-5 h-5 text-[var(--text-secondary)]" /> : <ChevronRight aria-hidden className="w-5 h-5 text-[var(--text-secondary)] rtl:-scale-x-100" />}
                </button>

                {/* Expanded Actions */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-default)] p-4 space-y-3">
                    {/* Quick Wins */}
                    {(plan.quickWins || []).length > 0 && (
                      <div className="p-3 rounded-lg bg-[var(--color-low-bg)] border border-[var(--color-low)]/30">
                        <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">
                          {t('quickWins')}
                        </p>
                        {(plan.quickWins as RemediationAction[]).map((qw, i) => (
                          <p key={i} className="text-xs text-[var(--text-secondary)]"><bdi>{qw.description}</bdi></p>
                        ))}
                      </div>
                    )}

                    {/* Action List */}
                    <div className="space-y-2">
                      {actions.map((action, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)]"
                        >
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] flex items-center justify-center text-xs font-bold">
                            {action.priority}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tone('info')}`}>
                                {t.has(`actionTypes.${action.actionType}`) ? t(`actionTypes.${action.actionType}`) : action.actionType.replace(/_/g, ' ')}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)] inline-flex items-center gap-1">
                                {t('tierChange', { from: tierLabel(action.currentTier), to: tierLabel(action.effectiveTier) })}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)]">
                                {t('riskValue', { score: action.riskScore })}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-[var(--text-primary)] mt-1">
                              <bdi>{action.description}</bdi>
                            </p>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              <bdi>{action.justification}</bdi>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Approval Buttons */}
                    {plan.status === 'draft' && !canDecide && (
                      <p className="pt-3 border-t border-[var(--border-default)] text-xs text-[var(--text-secondary)]">
                        {t('awaitingCiso')}
                      </p>
                    )}
                    {plan.status === 'draft' && canDecide && (
                      <div className="flex items-center justify-end gap-3 flex-wrap pt-3 border-t border-[var(--border-default)]">
                        <button
                          onClick={() => setShowRejectDialog(plan.id)}
                          className="px-4 py-2 rounded-lg border border-[var(--color-critical)]/40 text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))] text-sm font-medium hover:bg-[var(--color-critical-bg)]"
                        >
                          <XCircle aria-hidden className="w-4 h-4 inline-block me-1" />
                          {t('reject')}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(t('approveConfirm', { count: actions.length }))) {
                              approveMutation.mutate(plan.id)
                            }
                          }}
                          disabled={approveMutation.isPending}
                          className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {approveMutation.isPending ? (
                            <Loader2 aria-hidden className="w-4 h-4 inline-block me-1 animate-spin" />
                          ) : (
                            <CheckCircle2 aria-hidden className="w-4 h-4 inline-block me-1" />
                          )}
                          {t('approve')}
                        </button>
                      </div>
                    )}

                    {/* Reject Dialog */}
                    {canDecide && showRejectDialog === plan.id && (
                      <div className="p-4 rounded-lg border border-[var(--color-critical)]/30 bg-[var(--color-critical-bg)] space-y-3">
                        <label htmlFor={`reject-${plan.id}`} className="block text-sm font-medium text-[var(--text-primary)]">{t('rejectTitle')}</label>
                        <textarea
                          id={`reject-${plan.id}`}
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          placeholder={t('rejectPlaceholder')}
                          className="w-full p-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm resize-none"
                          rows={2}
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setShowRejectDialog(null); setRejectReason('') }}
                            className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          >
                            {tCommon('cancel')}
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate({ planId: plan.id, reason: rejectReason })}
                            disabled={rejectMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-800 disabled:opacity-50"
                          >
                            {t('confirmReject')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
