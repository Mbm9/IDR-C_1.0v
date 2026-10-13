'use client'

import { useState, useEffect, useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate, formatRelativeTime } from '@/lib/utils/formatters'
import { BlastRadiusGraph } from '@/components/dashboard/blast-radius-graph'
import type { BlastRadiusGraphProps } from '@/components/dashboard/blast-radius-graph'
import type { IdentityDetail } from '@/lib/hooks/use-identities'
import { useAppRole } from '@/lib/hooks/use-app-role'
import { useEnumLabel } from '@/components/ui/enum-label'
import { TONE_TEXT, toneBadge, riskTone, severityTone, statusTone, tierTone, type Tone } from '@/components/ui/tone'

const TABS = ['overview', 'accounts', 'entitlements', 'groups', 'violations', 'timeline', 'ai_insights', 'blast_radius'] as const

type TabKey = (typeof TABS)[number]

interface Props {
  data: IdentityDetail
}

const TIER_KEYS = ['tier_0', 'tier_1', 'tier_2', 'unclassified']
const tierKeyOf = (tier: string | null | undefined) => (tier && TIER_KEYS.includes(tier) ? tier : 'unclassified')

const thClass = 'px-3 py-2 text-start text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap'
const cardClass = 'bg-[var(--bg-secondary)] rounded-lg p-3 border border-[var(--border-default)]'

export function IdentityTabs({ data }: Props) {
  const t = useTranslations('identityDetail')
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const counts: Partial<Record<TabKey, number>> = {
    accounts: data.accounts.length,
    entitlements: data.entitlements.length,
    groups: data.groups.length,
    violations: data.violations.length,
    timeline: data.timeline.length,
  }

  // Arrow keys move between tabs (WAI-ARIA tabs pattern); logical order follows the reading direction.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.indexOf(activeTab)
    const rtl = document.documentElement.dir === 'rtl'
    let next = -1
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (idx + 1) % TABS.length
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    setActiveTab(TABS[next])
    tabRefs.current[TABS[next]]?.focus()
  }

  return (
    <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)]" style={{ boxShadow: 'var(--shadow-card)' }}>
      {/* Tab bar */}
      <div className="border-b border-[var(--border-default)] px-6">
        <div role="tablist" aria-label={t('tabsLabel')} className="flex gap-6 -mb-px overflow-x-auto" onKeyDown={onKeyDown}>
          {TABS.map((tab) => {
            const count = counts[tab]
            const selected = activeTab === tab
            return (
              <button
                key={tab}
                ref={(el) => { tabRefs.current[tab] = el }}
                id={`identity-tab-${tab}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`identity-panel-${tab}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  selected
                    ? `border-[var(--color-info)] ${TONE_TEXT.info}`
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t(`tabs.${tab}`)}
                {count !== undefined && (
                  <span className="ms-1.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div
        className="p-6 overflow-x-auto"
        role="tabpanel"
        id={`identity-panel-${activeTab}`}
        aria-labelledby={`identity-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'accounts' && <AccountsTab accounts={data.accounts} />}
        {activeTab === 'entitlements' && <EntitlementsTab entitlements={data.entitlements} />}
        {activeTab === 'groups' && <GroupsTab groups={data.groups} />}
        {activeTab === 'violations' && <ViolationsTab violations={data.violations} />}
        {activeTab === 'timeline' && <TimelineTab timeline={data.timeline} />}
        {activeTab === 'ai_insights' && <AIInsightsTab data={data} />}
        {activeTab === 'blast_radius' && <BlastRadiusTab identityId={data.identity.id} identityName={data.identity.displayName} />}
      </div>
    </div>
  )
}

function OverviewTab({ data }: { data: IdentityDetail }) {
  const t = useTranslations('identityDetail')
  const locale = useLocale()
  const label = useEnumLabel()
  const { identity } = data
  const date = (v: string | null) => (v ? formatDate(v, locale) : null)
  const fields: { key: string; value: ReactNode; ltr?: boolean }[] = [
    { key: 'displayName', value: identity.displayName, ltr: true },
    { key: 'upn', value: identity.upn, ltr: true },
    { key: 'samAccountName', value: identity.samAccountName, ltr: true },
    { key: 'email', value: identity.email, ltr: true },
    { key: 'department', value: identity.department },
    { key: 'sourceSystem', value: label('sourceSystem', identity.sourceSystem) },
    { key: 'sourceId', value: (identity as { sourceId?: string | null }).sourceId, ltr: true },
    { key: 'lastLogon', value: date(identity.lastLogonAt) },
    { key: 'passwordLastSet', value: date(identity.passwordLastSetAt) },
    { key: 'createdInSource', value: date(identity.createdInSourceAt) },
    { key: 'expiry', value: date(identity.expiryAt) },
    { key: 'created', value: date(identity.createdAt) },
  ].filter((f) => f.value)

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {fields.map((field) => (
        <div key={field.key} className="min-w-0">
          <dt className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t(`fields.${field.key}`)}</dt>
          <dd className="text-sm text-[var(--text-primary)] mt-0.5 break-words">
            {field.ltr ? <bdi>{field.value}</bdi> : field.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function AccountsTab({ accounts }: { accounts: IdentityDetail['accounts'] }) {
  const t = useTranslations('identityDetail')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const label = useEnumLabel()
  if (accounts.length === 0) return <Empty label={t('noAccounts')} />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--border-default)]">
          <th scope="col" className={thClass}>{t('colPlatform')}</th>
          <th scope="col" className={thClass}>{t('colAccountName')}</th>
          <th scope="col" className={thClass}>{t('colType')}</th>
          <th scope="col" className={thClass}>{t('colEnabled')}</th>
          <th scope="col" className={thClass}>{t('colMfa')}</th>
          <th scope="col" className={thClass}>{t('colLastAuth')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border-default)]">
        {accounts.map((acc) => (
          <tr key={acc.id}>
            <td className="px-3 py-2 text-[var(--text-primary)]">{label('platform', acc.platform)}</td>
            <td className="px-3 py-2 font-medium text-[var(--text-primary)]"><bdi>{acc.accountName}</bdi></td>
            <td className="px-3 py-2 text-[var(--text-secondary)]">{label('accountType', acc.accountType)}</td>
            <td className="px-3 py-2">
              <span className={`text-xs font-medium ${TONE_TEXT[acc.enabled ? 'low' : 'critical']}`}>
                {acc.enabled ? t('yes') : t('no')}
              </span>
            </td>
            <td className="px-3 py-2">
              <span className={`text-xs font-medium ${TONE_TEXT[acc.mfaEnabled ? 'low' : 'critical']}`}>
                {acc.mfaEnabled ? (acc.mfaMethods?.length ? <bdi>{acc.mfaMethods.join(', ')}</bdi> : t('mfaEnabled')) : t('mfaDisabled')}
              </span>
            </td>
            <td className="px-3 py-2 text-[var(--text-secondary)] text-xs whitespace-nowrap">
              {acc.lastAuthenticatedAt ? formatRelativeTime(acc.lastAuthenticatedAt, locale) : tCommon('never')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TierPill({ tier }: { tier: string | null | undefined }) {
  const tTiers = useTranslations('tiers')
  const key = tierKeyOf(tier)
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${toneBadge(tierTone(key))}`}>
      {tTiers(key)}
    </span>
  )
}

function EntitlementsTab({ entitlements }: { entitlements: IdentityDetail['entitlements'] }) {
  const t = useTranslations('identityDetail')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const label = useEnumLabel()
  if (entitlements.length === 0) return <Empty label={t('noEntitlements')} />
  const certTone: Record<string, Tone> = { certified: 'low', pending: 'medium', expired: 'critical', revoked: 'neutral' }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--border-default)]">
          <th scope="col" className={thClass}>{t('colPermission')}</th>
          <th scope="col" className={thClass}>{t('colResource')}</th>
          <th scope="col" className={thClass}>{t('colTier')}</th>
          <th scope="col" className={thClass}>{t('colCertification')}</th>
          <th scope="col" className={thClass}>{t('colLastUsed')}</th>
          <th scope="col" className={thClass}>{t('colRiskTags')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border-default)]">
        {entitlements.map((ent) => (
          <tr key={ent.id}>
            <td className="px-3 py-2">
              <p className="font-medium text-[var(--text-primary)]"><bdi>{ent.permissionName}</bdi></p>
              <p className="text-xs text-[var(--text-secondary)]">{label('permissionType', ent.permissionType)}</p>
            </td>
            <td className="px-3 py-2 text-[var(--text-secondary)] text-xs"><bdi>{ent.resourceName}</bdi></td>
            <td className="px-3 py-2"><TierPill tier={ent.adTierOfPermission} /></td>
            <td className="px-3 py-2">
              <span className={`text-xs font-medium ${TONE_TEXT[certTone[ent.certificationStatus] ?? 'neutral']}`}>
                {label('certStatus', ent.certificationStatus)}
              </span>
            </td>
            <td className="px-3 py-2 text-[var(--text-secondary)] text-xs whitespace-nowrap">
              {ent.lastUsedAt ? formatRelativeTime(ent.lastUsedAt, locale) : tCommon('never')}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {ent.riskTags?.map((tag: string) => (
                  <span key={tag} className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${toneBadge('critical')}`}>
                    {label('riskTag', tag)}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GroupsTab({ groups }: { groups: IdentityDetail['groups'] }) {
  const t = useTranslations('identityDetail')
  const label = useEnumLabel()
  if (groups.length === 0) return <Empty label={t('noGroups')} />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--border-default)]">
          <th scope="col" className={thClass}>{t('colGroup')}</th>
          <th scope="col" className={thClass}>{t('colType')}</th>
          <th scope="col" className={thClass}>{t('colTier')}</th>
          <th scope="col" className={thClass}>{t('colMembership')}</th>
          <th scope="col" className={thClass}>{t('colPrivileged')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border-default)]">
        {groups.map((g) => (
          <tr key={g.id}>
            <td className="px-3 py-2 font-medium text-[var(--text-primary)]"><bdi>{g.groupName}</bdi></td>
            <td className="px-3 py-2 text-[var(--text-secondary)] text-xs">{label('groupType', g.groupType)}</td>
            <td className="px-3 py-2"><TierPill tier={g.groupAdTier} /></td>
            <td className="px-3 py-2 text-[var(--text-secondary)] text-xs">{label('membershipType', g.membershipType)}</td>
            <td className="px-3 py-2">
              {g.isPrivileged && <span className={`text-xs font-medium ${TONE_TEXT.critical}`}>{t('yes')}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ViolationsTab({ violations }: { violations: IdentityDetail['violations'] }) {
  const t = useTranslations('identityDetail')
  const tSeverity = useTranslations('severity')
  const locale = useLocale()
  const label = useEnumLabel()
  if (violations.length === 0) return <Empty label={t('noViolations')} />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--border-default)]">
          <th scope="col" className={thClass}>{t('colType')}</th>
          <th scope="col" className={thClass}>{t('colSeverity')}</th>
          <th scope="col" className={thClass}>{t('colStatus')}</th>
          <th scope="col" className={thClass}>{t('colPolicy')}</th>
          <th scope="col" className={thClass}>{t('colDetected')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border-default)]">
        {violations.map((v) => (
          <tr key={v.id}>
            <td className="px-3 py-2 text-[var(--text-primary)] text-xs">{label('violationType', v.violationType)}</td>
            <td className="px-3 py-2">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${toneBadge(severityTone(v.severity))}`}>
                {tSeverity.has(v.severity) ? tSeverity(v.severity) : v.severity}
              </span>
            </td>
            <td className="px-3 py-2">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${toneBadge(statusTone(v.status))}`}>
                {label('findingStatus', v.status)}
              </span>
            </td>
            <td className="px-3 py-2 text-[var(--text-secondary)] text-xs">{v.policyName}</td>
            <td className="px-3 py-2 text-[var(--text-secondary)] text-xs whitespace-nowrap">{formatRelativeTime(v.detectedAt, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TimelineTab({ timeline }: { timeline: IdentityDetail['timeline'] }) {
  const t = useTranslations('identityDetail')
  const locale = useLocale()
  const label = useEnumLabel()
  if (timeline.length === 0) return <Empty label={t('noActivity')} />
  const sourceTone: Record<string, Tone> = { manual: 'info', automated: 'neutral', ai_recommended: 'nhi' }
  return (
    <ol className="space-y-4">
      {timeline.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--color-info)] mt-2 flex-shrink-0" aria-hidden="true" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {label('actionType', entry.actionType)}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {formatRelativeTime(entry.createdAt, locale)}
              </span>
            </div>
            {entry.actorName && (
              <p className="text-xs text-[var(--text-secondary)]">{t.rich('byActor', { name: entry.actorName, bdi: (c) => <bdi>{c}</bdi> })}</p>
            )}
            {entry.rationale && (
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">{entry.rationale}</p>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${toneBadge(sourceTone[entry.source] ?? 'nhi')}`}>
              {label('actionSource', entry.source)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

type Weight = 'critical' | 'high' | 'medium' | 'low'
interface RiskFactor { factor: string; weight: string; description: string }

function AIInsightsTab({ data }: { data: IdentityDetail }) {
  const t = useTranslations('identityDetail')
  const tTiers = useTranslations('tiers')
  const tSeverity = useTranslations('severity')
  const { can } = useAppRole()
  const { identity, violations, entitlements, groups } = data
  const [analysisResult, setAnalysisResult] = useState<{
    summary: string
    recommendations: string[]
    riskNarrative: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openViolations = violations.filter((v) => v.status === 'open')

  const riskFactors: RiskFactor[] = (() => {
    // Factors persisted by the risk scorer are shown as stored.
    if (identity.riskFactors && Array.isArray(identity.riskFactors)) {
      return identity.riskFactors as RiskFactor[]
    }
    // Otherwise derive a summary from the identity's own data.
    const factors: RiskFactor[] = []
    const add = (key: string, weight: Weight, values: Record<string, string | number> = {}) =>
      factors.push({ factor: t(`factors.${key}.name`), weight, description: t(`factors.${key}.description`, values) })

    if (identity.tierViolation) {
      add('tierViolation', 'critical', {
        assigned: tTiers(tierKeyOf(identity.adTier)),
        effective: tTiers(tierKeyOf(identity.effectiveTier)),
      })
    }
    if (openViolations.length > 0) {
      add('openViolations', openViolations.some((v) => v.severity === 'critical') ? 'critical' : 'high', { count: openViolations.length })
    }
    const expiredCerts = entitlements.filter((e) => e.certificationStatus === 'expired').length
    if (expiredCerts > 0) add('expiredCertifications', 'medium', { count: expiredCerts })
    const unused = entitlements.filter((e) => !e.lastUsedAt).length
    if (unused > 0) add('unusedEntitlements', 'medium', { count: unused })
    const privileged = groups.filter((g) => g.isPrivileged).length
    if (privileged > 0) add('privilegedGroups', 'high', { count: privileged })
    const toxic = entitlements.flatMap((e) => e.riskTags || []).filter((tag) => tag === 'toxic_combination' || tag === 'sod_violation').length
    if (toxic > 0) add('toxicCombinations', 'critical', { count: toxic })
    if (identity.status === 'dormant') add('dormantIdentity', 'medium')
    if (identity.status === 'orphaned') add('orphanedIdentity', 'high')
    return factors
  })()

  const level = riskTone(identity.riskScore) as Weight

  const handleRequestAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: identity.id, scope: 'single_identity' }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || t('analysisFailedStatus', { status: res.status }))
      }
      const result = await res.json()
      setAnalysisResult({
        summary: result.executiveSummary || result.summary || t('analysisComplete'),
        recommendations: result.rankedActions?.map((a: any) => a.description || a.action || String(a)) || result.recommendations || [],
        riskNarrative: result.riskNarrative || result.narrative || '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analysisFailed'))
    } finally {
      setLoading(false)
    }
  }

  const weightLabel = (w: string) => {
    const key = w.toLowerCase()
    return tSeverity.has(key) ? tSeverity(key) : w
  }

  return (
    <div className="space-y-6">
      {/* Risk Summary */}
      <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-default)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('riskSummary')}</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">{t('riskScore')}</dt>
            <dd className={`text-lg font-bold ${TONE_TEXT[level]}`}><bdi>{identity.riskScore}/100</bdi></dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">{t('riskLevel')}</dt>
            <dd className="text-sm font-medium text-[var(--text-primary)]">{tSeverity(level)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">{t('tierStatus')}</dt>
            <dd className="text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">
              {tTiers(tierKeyOf(identity.adTier))}
              {identity.tierViolation && (
                <span className={`ms-1.5 text-xs font-medium ${TONE_TEXT.critical}`}>{t('violationFlag')}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">{t('openViolations')}</dt>
            <dd className="text-sm font-medium text-[var(--text-primary)]">{openViolations.length}</dd>
          </div>
        </dl>
      </div>

      {/* Risk Factors */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('riskFactors')}</h3>
        {riskFactors.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">{t('noRiskFactors')}</p>
        ) : (
          <ul className="space-y-2">
            {riskFactors.map((rf, idx) => (
              <li key={idx} className="flex items-start gap-3 p-3 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg">
                <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${toneBadge(severityTone(rf.weight?.toLowerCase()))}`}>
                  {weightLabel(rf.weight)}
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{rf.factor}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{rf.description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* AI Analysis */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('aiAnalysis')}</h3>
          {can('analyst') && (
            <button
              type="button"
              onClick={handleRequestAnalysis}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-nhi) 85%, black)' }}
            >
              {loading ? t('analyzing') : t('requestAnalysis')}
            </button>
          )}
        </div>

        {error && (
          <div className="bg-[var(--color-critical-bg)] border border-[var(--color-critical)] rounded-lg p-3 mb-3" role="alert">
            <p className={`text-sm ${TONE_TEXT.critical}`}>{error}</p>
          </div>
        )}

        {analysisResult ? (
          <div className="space-y-4">
            {analysisResult.riskNarrative && (
              <div className={`rounded-lg p-4 border border-[var(--border-default)] ${toneBadge('nhi')}`}>
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-1">{t('riskNarrative')}</h4>
                <p className="text-sm">{analysisResult.riskNarrative}</p>
              </div>
            )}
            {analysisResult.summary && (
              <div className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg p-4">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">{t('executiveSummary')}</h4>
                <p className="text-sm text-[var(--text-primary)]">{analysisResult.summary}</p>
              </div>
            )}
            {analysisResult.recommendations.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">{t('recommendations')}</h4>
                <ol className="space-y-2">
                  {analysisResult.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2 p-3 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${toneBadge('info')}`}>
                        {idx + 1}
                      </span>
                      <p className="text-sm text-[var(--text-primary)]">{rec}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : !loading ? (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-6 text-center">
            <p className="text-sm text-[var(--text-secondary)] mb-1">{t('noAnalysis')}</p>
            {can('analyst') && <p className="text-xs text-[var(--text-secondary)]">{t('noAnalysisHint')}</p>}
          </div>
        ) : (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-6 text-center" role="status">
            <div className="inline-block w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--color-nhi)] rounded-full animate-spin mb-2" aria-hidden="true" />
            <p className="text-sm text-[var(--text-secondary)]">{t('analyzingProfile')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function BlastRadiusTab({ identityId, identityName }: { identityId: string; identityName: string }) {
  const t = useTranslations('identityDetail')
  const tTiers = useTranslations('tiers')
  const tCommon = useTranslations('common')
  const [graphData, setGraphData] = useState<BlastRadiusGraphProps['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const ringLabel = useRef({ 1: t('ringDirect'), 2: t('ringIndirect'), 3: t('ringTransitive') })

  const loadBlastRadius = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/blast-radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId, maxDepth: 3 }),
      })
      if (!res.ok) throw new Error(t('blastFailed'))
      const data = await res.json()

      // Transform API response to graph format
      const allNodes = (data.rings || []).flatMap((r: any) => r.nodes || [])
      const t0Count = allNodes.filter((n: any) => n.tier === 'tier_0').length
      const totalReachable = allNodes.length
      const blastScore = Math.min(100, totalReachable * 2 + t0Count * 15 + allNodes.filter((n: any) => n.criticality === 'critical' || n.tier === 'tier_0').length * 5)

      let highestTier = 'tier_2'
      for (const n of allNodes) {
        if (n.tier === 'tier_0') { highestTier = 'tier_0'; break }
        if (n.tier === 'tier_1') highestTier = 'tier_1'
      }

      const labels = ringLabel.current as Record<number, string>
      setGraphData({
        center: {
          id: data.center.id,
          name: data.center.name,
          type: data.center.type,
          tier: data.center.tier,
          riskScore: data.center.riskScore,
          subType: data.center.subType,
        },
        rings: (data.rings || []).map((ring: any) => ({
          level: ring.depth,
          label: labels[ring.depth] ?? labels[3],
          nodes: (ring.nodes || []).map((n: any) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            tier: n.tier,
            subType: n.subType,
            accessType: n.type,
            criticality: n.criticality,
          })),
          edges: [],
        })),
        stats: {
          totalReachable,
          t0Reachable: t0Count,
          blastRadiusScore: blastScore,
          highestTier,
        },
      })
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blastFailed'))
    } finally {
      setLoading(false)
    }
  }, [identityId, t])

  // Auto-load on mount
  useEffect(() => {
    if (!loaded) loadBlastRadius()
  }, [loaded, loadBlastRadius])

  if (loading) {
    return (
      <div className="flex flex-col items-center py-12" role="status">
        <div className="w-8 h-8 border-4 border-[var(--border-default)] border-t-[var(--color-info)] rounded-full animate-spin mb-4" aria-hidden="true" />
        <p className="text-sm text-[var(--text-secondary)]">{t.rich('computingBlast', { name: identityName, bdi: (c) => <bdi>{c}</bdi> })}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className={`text-sm mb-3 ${TONE_TEXT.critical}`}>{error}</p>
        <button
          type="button"
          onClick={loadBlastRadius}
          className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-90"
          style={{ backgroundColor: 'var(--color-info)' }}
        >
          {t('retry')}
        </button>
      </div>
    )
  }

  if (!graphData) return <Empty label={t('noBlastData')} />

  const highest = graphData.stats.highestTier
  return (
    <div className="space-y-4">
      {/* Stats */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={cardClass}>
          <dt className="text-xs text-[var(--text-secondary)]">{t('totalReachable')}</dt>
          <dd className="text-lg font-bold text-[var(--text-primary)]">{graphData.stats.totalReachable}</dd>
        </div>
        <div className={cardClass}>
          <dt className="text-xs text-[var(--text-secondary)]">{t('t0Reachable')}</dt>
          <dd className={`text-lg font-bold ${graphData.stats.t0Reachable > 0 ? TONE_TEXT.critical : 'text-[var(--text-primary)]'}`}>
            {graphData.stats.t0Reachable}
          </dd>
        </div>
        <div className={cardClass}>
          <dt className="text-xs text-[var(--text-secondary)]">{t('blastScore')}</dt>
          <dd className={`text-lg font-bold ${
            graphData.stats.blastRadiusScore >= 70 ? TONE_TEXT.critical :
            graphData.stats.blastRadiusScore >= 40 ? TONE_TEXT.high : 'text-[var(--text-primary)]'
          }`}>
            {graphData.stats.blastRadiusScore}
          </dd>
        </div>
        <div className={cardClass}>
          <dt className="text-xs text-[var(--text-secondary)]">{t('highestTier')}</dt>
          <dd className={`text-lg font-bold whitespace-nowrap ${highest === 'tier_0' ? TONE_TEXT.critical : 'text-[var(--text-primary)]'}`}>
            {highest ? tTiers(tierKeyOf(highest)) : tCommon('na')}
          </dd>
        </div>
      </dl>

      {/* Graph */}
      <BlastRadiusGraph data={graphData} height={500} />
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-[var(--text-secondary)] text-center py-8">{label}</p>
}
