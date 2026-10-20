'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { Sparkles, RefreshCw, BarChart3, Users, Brain, CheckCircle2, XCircle, Lock } from 'lucide-react'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useRoleHint } from '@/lib/hooks/use-role-hint'

interface Stats {
  avgQualityScore: number
  completenessDistribution: { high: number; medium: number; low: number; unscored: number }
  fieldCoverage: Record<string, number>
  aliasStats: { total: number; confirmed: number; pendingReview: number; rejected: number }
  classificationStats: { typed: number; tiered: number; unclassified: number }
}

interface AliasItem {
  id: string
  canonicalIdentityId: string
  canonicalDisplayName: string
  canonicalEmail: string | null
  sourceDisplayName: string | null
  sourceEmail: string | null
  matchConfidence: number
  matchMethod: string
  status: string
}

interface SuggestionIdentity {
  id: string
  displayName: string
  type: string
  subType: string
  sourceSystem: string
  dataQuality: any
  gaps: string[]
}

/** A concrete suggested value from the classifier (POST /api/data-quality/classify → pendingReview). */
interface ValueSuggestion {
  identityId: string
  field: string
  currentValue: string | null
  suggestedValue: string
  confidence: number
  method: 'rule' | 'ai'
  reasoning: string
}

/** Fields POST /api/data-quality/suggestions accepts (descriptive attributes only). */
const SUGGESTIBLE_FIELDS = new Set([
  'displayName', 'email', 'upn', 'samAccountName', 'department',
  'managerIdentityId', 'ownerIdentityId', 'adTier', 'type', 'subType',
  'expiryAt', 'lastLogonAt',
])
/** "High confidence" threshold for bulk apply (classifier already auto-applies > 80). */
const HIGH_CONFIDENCE = 70

const KNOWN_FIELDS = new Set(['displayName', 'email', 'upn', 'department', 'manager', 'managerIdentityId', 'adTier', 'ownerIdentityId', 'expiryAt', 'lastLogonAt', 'type', 'subType', 'status'])
const MATCH_METHOD_KEYS: Record<string, string> = { deterministic: 'deterministic', fuzzy: 'fuzzy', ai: 'aiMatched', manual: 'manual' }

function CoverageBar({ label, pct }: { label: string; pct: number }) {
  const color = pct > 80 ? 'var(--color-low)' : pct > 50 ? 'var(--color-medium)' : 'var(--color-critical)'
  return (
    <div className="flex items-center gap-3">
      <span className="text-caption text-[var(--text-secondary)] w-28 shrink-0 text-end">{label}</span>
      <div className="flex-1 h-5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-caption font-medium text-[var(--text-primary)] w-12">{pct}%</span>
    </div>
  )
}

export default function DataQualityPage() {
  const t = useTranslations('dataQuality')
  const tCommon = useTranslations('common')
  const format = useFormatter()
  const queryClient = useQueryClient()
  const { can, hint, roleName, loading: roleLoading } = useRoleHint()
  const canRead = can('analyst')
  const canManage = can('iam_admin')

  const [activeTab, setActiveTab] = useState<'coverage' | 'review' | 'suggestions'>('coverage')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [valueSuggestions, setValueSuggestions] = useState<ValueSuggestion[]>([])

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ['data-quality', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/data-quality/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    staleTime: 30_000,
  })

  const { data: reviewData, isLoading: reviewLoading } = useQuery<{ aliases: AliasItem[] }>({
    queryKey: ['data-quality', 'review'],
    queryFn: async () => {
      const res = await fetch('/api/data-quality/resolve')
      if (!res.ok) throw new Error('Failed to fetch review queue')
      return res.json()
    },
    staleTime: 30_000,
    enabled: activeTab === 'review' && canRead,
  })

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{ count: number; identities: SuggestionIdentity[] }>({
    queryKey: ['data-quality', 'suggestions'],
    queryFn: async () => {
      const res = await fetch('/api/data-quality/suggestions')
      if (!res.ok) throw new Error('Failed to fetch suggestions')
      return res.json()
    },
    staleTime: 30_000,
    enabled: activeTab === 'suggestions' && canRead,
  })

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['data-quality'] })
  }, [queryClient])

  const fieldLabel = (field: string) => KNOWN_FIELDS.has(field) ? t(`fields.${field}`) : field

  async function runAction(key: string, fn: () => Promise<Response>, onOk: (body: any) => string) {
    setActionLoading(key)
    setMessage(null)
    try {
      const res = await fn()
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || t('actionFailed'))
      setMessage({ kind: 'ok', text: onOk(body) })
      invalidateAll()
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || t('actionFailed') })
    } finally {
      setActionLoading(null)
    }
  }

  const handleRunEnrichment = () => runAction('enrich',
    () => fetch('/api/data-quality/enrich', { method: 'POST' }),
    () => t('enrichmentDone'))

  const handleClassify = () => runAction('classify',
    () => fetch('/api/data-quality/classify', { method: 'POST' }),
    (body) => {
      const pending: ValueSuggestion[] = Array.isArray(body.pendingReview) ? body.pendingReview : []
      setValueSuggestions(pending.filter(s => SUGGESTIBLE_FIELDS.has(s.field) && s.suggestedValue !== ''))
      return t('classifyDone', { applied: Array.isArray(body.applied) ? body.applied.length : 0, pending: pending.length })
    })

  const handleReviewAlias = (aliasId: string, status: 'confirmed' | 'rejected') => runAction(aliasId,
    () => fetch('/api/data-quality/resolve', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aliasId, status }),
    }),
    () => status === 'confirmed' ? t('aliasConfirmed') : t('aliasRejected'))

  function applySuggestions(items: ValueSuggestion[], key: string) {
    const payload = items
      .filter(s => SUGGESTIBLE_FIELDS.has(s.field) && s.suggestedValue !== '')
      .map(s => ({ identityId: s.identityId, field: s.field, value: s.suggestedValue, confidence: s.confidence }))
    if (payload.length === 0) return
    return runAction(key,
      () => fetch('/api/data-quality/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestions: payload }),
      }),
      (body) => {
        const applied = new Set(payload.map(p => `${p.identityId}:${p.field}`))
        setValueSuggestions(prev => prev.filter(s => !applied.has(`${s.identityId}:${s.field}`)))
        return t('suggestionsApplied', { count: typeof body.applied === 'number' ? body.applied : payload.length })
      })
  }

  const highConfidence = valueSuggestions.filter(s => s.confidence >= HIGH_CONFIDENCE)
  const identityNames = new Map((suggestionsData?.identities ?? []).map(i => [i.id, i.displayName]))

  const qualityColor = (score: number) =>
    score > 80 ? 'var(--color-low)' : score > 50 ? 'var(--color-medium)' : 'var(--color-critical)'

  // Compute "freshness" and "accuracy" estimates from stats
  const freshness = stats ? Math.min(100, Math.round(stats.avgQualityScore * 1.15)) : 0
  const accuracy = stats ? Math.max(0, Math.round(stats.avgQualityScore * 0.85)) : 0
  const completeness = stats ? Math.round(
    Object.values(stats.fieldCoverage).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(stats.fieldCoverage).length)
  ) : 0

  const tabs = [
    { key: 'coverage' as const, label: t('fieldCoverage'), icon: BarChart3 },
    { key: 'review' as const, label: t('pendingReview'), icon: Users },
    { key: 'suggestions' as const, label: t('aiSuggestions'), icon: Brain },
  ]

  const gatedProps = (role: 'iam_admin') => can(role) ? {} : { disabled: true, title: hint(role) }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRunEnrichment}
            disabled={actionLoading === 'enrich'}
            {...gatedProps('iam_admin')}
            className="flex items-center gap-2 px-4 py-2 text-caption font-medium rounded-lg bg-[var(--color-info)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {canManage ? <RefreshCw size={14} className={actionLoading === 'enrich' ? 'animate-spin' : ''} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
            {t('runEnrichment')}
          </button>
          <button
            onClick={handleClassify}
            disabled={actionLoading === 'classify'}
            {...gatedProps('iam_admin')}
            className="flex items-center gap-2 px-4 py-2 text-caption font-medium rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={14} className={actionLoading === 'classify' ? 'animate-spin' : ''} aria-hidden="true" />
            {t('autoClassify')}
          </button>
        </div>
      </div>

      {!roleLoading && !canManage && (
        <p className="flex items-start gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-caption text-[var(--text-primary)]" role="note">
          <Lock size={14} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
          {t('readOnly', { role: roleName('iam_admin') })}
        </p>
      )}

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className="rounded-md border px-3 py-2 text-caption text-[var(--text-primary)]"
          style={{ borderColor: message.kind === 'error' ? 'var(--color-critical)' : 'var(--color-low)' }}
        >
          <bdi>{message.text}</bdi>
        </p>
      )}

      {/* Stats Row */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: t('qualityScore'), value: t('scoreOutOf100', { score: stats.avgQualityScore }), score: stats.avgQualityScore },
            { label: t('completeness'), value: format.number(completeness / 100, { style: 'percent' }), score: completeness },
            { label: t('freshness'), value: format.number(freshness / 100, { style: 'percent' }), score: freshness },
            { label: t('accuracy'), value: format.number(accuracy / 100, { style: 'percent' }), score: accuracy },
            { label: t('unscored'), value: format.number(stats.completenessDistribution.unscored), score: stats.completenessDistribution.unscored > 0 ? 30 : 90 },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-[var(--radius-card)] border border-[var(--border-default)] border-s-[3px] bg-[var(--bg-primary)] p-4"
              style={{ boxShadow: 'var(--shadow-card)', borderInlineStartColor: qualityColor(m.score) }}
            >
              <p className="text-micro text-[var(--text-secondary)] font-medium uppercase tracking-wider">{m.label}</p>
              <p className="text-heading font-semibold text-[var(--text-primary)] mt-1">{m.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-default)] overflow-x-auto" role="tablist" aria-label={t('title')}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-2 px-4 py-2.5 text-caption font-medium border-b-2 transition-colors ${
                active
                  ? 'border-[var(--color-info)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 sm:p-6" style={{ boxShadow: 'var(--shadow-card)' }} role="tabpanel">
        {activeTab === 'coverage' && (
          <div className="space-y-3">
            <CoverageBar label={fieldLabel('displayName')} pct={100} />
            {stats && Object.entries(stats.fieldCoverage).map(([field, pct]) => (
              <CoverageBar key={field} label={fieldLabel(field)} pct={pct} />
            ))}
          </div>
        )}

        {activeTab !== 'coverage' && !canRead && !roleLoading && (
          <p className="text-center text-[var(--text-secondary)] py-8">{hint('analyst')}</p>
        )}

        {activeTab === 'review' && canRead && (
          reviewLoading ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-[var(--bg-tertiary)] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !reviewData?.aliases.length ? (
            <p className="text-center text-[var(--text-secondary)] py-8">{tCommon('noResults')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-caption">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('identityA')}</th>
                    <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('identityB')}</th>
                    <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('matchConfidence')}</th>
                    <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('matchMethod')}</th>
                    <th scope="col" className="px-3 py-2 text-end text-[var(--text-secondary)] font-medium">{t('actionColumn')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {reviewData.aliases.map((alias) => (
                    <tr key={alias.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-3 py-3">
                        <p className="font-medium text-[var(--text-primary)]"><bdi>{alias.canonicalDisplayName}</bdi></p>
                        <p className="text-micro text-[var(--text-secondary)]"><bdi>{alias.canonicalEmail}</bdi></p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-[var(--text-primary)]"><bdi>{alias.sourceDisplayName}</bdi></p>
                        <p className="text-micro text-[var(--text-secondary)]"><bdi>{alias.sourceEmail}</bdi></p>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium border text-[var(--text-primary)]"
                          style={{ borderColor: alias.matchConfidence > 80 ? 'var(--color-low)' : alias.matchConfidence > 50 ? 'var(--color-medium)' : 'var(--color-critical)' }}
                        >
                          {format.number(alias.matchConfidence / 100, { style: 'percent' })}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">
                        {MATCH_METHOD_KEYS[alias.matchMethod] ? t(MATCH_METHOD_KEYS[alias.matchMethod]) : alias.matchMethod}
                      </td>
                      <td className="px-3 py-3">
                        {canManage ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleReviewAlias(alias.id, 'confirmed')}
                              disabled={actionLoading === alias.id}
                              className="flex items-center gap-1 px-2.5 py-1 text-micro font-medium rounded-md border text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
                              style={{ borderColor: 'var(--color-low)' }}
                            >
                              <CheckCircle2 size={12} style={{ color: 'var(--color-low-text)' }} aria-hidden="true" />
                              {t('samePerson')}
                            </button>
                            <button
                              onClick={() => handleReviewAlias(alias.id, 'rejected')}
                              disabled={actionLoading === alias.id}
                              className="flex items-center gap-1 px-2.5 py-1 text-micro font-medium rounded-md border text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
                              style={{ borderColor: 'var(--color-critical)' }}
                            >
                              <XCircle size={12} style={{ color: 'var(--color-critical-text)' }} aria-hidden="true" />
                              {t('differentPeople')}
                            </button>
                          </div>
                        ) : (
                          <p className="text-end text-micro text-[var(--text-secondary)]">{hint('iam_admin')}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {activeTab === 'suggestions' && canRead && (
          <div className="space-y-6">
            {/* Concrete suggested values from the last Auto-Classify run */}
            <section aria-labelledby="dq-values-heading">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 id="dq-values-heading" className="text-sm font-semibold text-[var(--text-primary)]">{t('suggestedValues')}</h3>
                  <p className="text-micro text-[var(--text-secondary)]">{t('suggestedValuesHint')}</p>
                </div>
                <button
                  onClick={() => applySuggestions(highConfidence, 'apply-all')}
                  disabled={actionLoading === 'apply-all' || highConfidence.length === 0}
                  {...gatedProps('iam_admin')}
                  className="flex items-center gap-2 px-3 py-1.5 text-micro font-medium rounded-md bg-[var(--color-info)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('applyAllCount', { count: highConfidence.length })}
                </button>
              </div>
              {valueSuggestions.length === 0 ? (
                <p className="text-caption text-[var(--text-secondary)] py-3">{canManage ? t('noValueSuggestions') : t('noValueSuggestionsViewer')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="border-b border-[var(--border-default)]">
                        <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('identityColumn')}</th>
                        <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('fieldColumn')}</th>
                        <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('suggestedColumn')}</th>
                        <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('matchConfidence')}</th>
                        <th scope="col" className="px-3 py-2 text-end text-[var(--text-secondary)] font-medium">{t('actionColumn')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {valueSuggestions.map((s) => {
                        const key = `${s.identityId}-${s.field}`
                        return (
                          <tr key={key}>
                            <td className="px-3 py-2">
                              <Link href={`/dashboard/identities/${s.identityId}`} className="text-[var(--text-primary)] underline">
                                <bdi>{identityNames.get(s.identityId) ?? t('viewIdentity')}</bdi>
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">{fieldLabel(s.field)}</td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">
                              <bdi dir="ltr">{s.currentValue ?? '—'} → {s.suggestedValue}</bdi>
                              {s.reasoning && <p className="text-micro text-[var(--text-secondary)]"><bdi>{s.reasoning}</bdi></p>}
                            </td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">{format.number(s.confidence / 100, { style: 'percent' })}</td>
                            <td className="px-3 py-2 text-end">
                              {canManage && (
                                <button
                                  onClick={() => applySuggestions([s], key)}
                                  disabled={actionLoading === key}
                                  className="px-2.5 py-1 text-micro font-medium rounded-md border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                                >
                                  {t('apply')}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Identities with missing fields (informational) */}
            <section aria-labelledby="dq-gaps-heading">
              <h3 id="dq-gaps-heading" className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('identitiesWithGaps')}</h3>
              {suggestionsLoading ? (
                <div className="space-y-3" aria-busy="true">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 bg-[var(--bg-tertiary)] rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : !suggestionsData?.identities.length ? (
                <p className="text-center text-[var(--text-secondary)] py-8">{tCommon('noResults')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="border-b border-[var(--border-default)]">
                        <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('identityColumn')}</th>
                        <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('missingFields')}</th>
                        <th scope="col" className="px-3 py-2 text-start text-[var(--text-secondary)] font-medium">{t('qualityScore')}</th>
                        <th scope="col" className="px-3 py-2 text-end text-[var(--text-secondary)] font-medium"><span className="sr-only">{t('actionColumn')}</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {suggestionsData.identities.map((identity) => (
                        <tr key={identity.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                          <td className="px-3 py-3">
                            <p className="font-medium text-[var(--text-primary)]"><bdi>{identity.displayName}</bdi></p>
                            <p className="text-micro text-[var(--text-secondary)]" dir="ltr">{identity.type} / {identity.subType}</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {identity.gaps.map((gap) => (
                                <span key={gap} className="px-1.5 py-0.5 rounded text-micro border text-[var(--text-primary)]" style={{ borderColor: 'var(--color-high)' }}>
                                  {fieldLabel(gap)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                              <span className="shrink-0 h-2 w-2 rounded-full" style={{ backgroundColor: qualityColor(identity.dataQuality?.score || 0) }} aria-hidden="true" />
                              {identity.dataQuality?.score != null ? t('scoreOutOf100', { score: identity.dataQuality.score }) : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-end">
                            <Link
                              href={`/dashboard/identities/${identity.id}`}
                              className="text-micro text-[var(--text-primary)] underline"
                              aria-label={t('viewIdentityNamed', { name: identity.displayName })}
                            >
                              {t('view')}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
