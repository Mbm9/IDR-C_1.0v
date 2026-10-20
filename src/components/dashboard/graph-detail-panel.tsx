'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { isControlPlaneTier } from '@/lib/utils/tiers'

interface GraphDetailPanelProps {
  node: any | null
  links?: any[]
  allNodes?: any[]
  onClose: () => void
  isOpen: boolean
}

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const TONE = {
  critical: 'bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]',
  high: 'bg-[var(--color-high-bg)] text-[color:color-mix(in_srgb,var(--color-high)_60%,var(--text-primary))]',
  medium: 'bg-[var(--color-medium-bg)] text-[color:color-mix(in_srgb,var(--color-medium)_60%,var(--text-primary))]',
  low: 'bg-[var(--color-low-bg)] text-[color:color-mix(in_srgb,var(--color-low)_60%,var(--text-primary))]',
  info: 'bg-[var(--color-info-bg)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))]',
  neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
} as const

type T = ReturnType<typeof useTranslations>

/** Translate an enum-like value via `ns.<value>` when the key exists, else humanise it. */
function label(t: T, ns: string, value: string): string {
  return t.has(`${ns}.${value}`) ? t(`${ns}.${value}`) : value.replace(/_/g, ' ')
}

// Risk-factor fields that are bookkeeping, not factors.
const NON_FACTOR_KEYS = new Set(['history', 'riskVelocity'])

/**
 * Risk factors used to be a string array; the risk scorer now stores an object of
 * flags and counters (plus history/riskVelocity). Accept both shapes and return the
 * active factors as pill keys.
 */
function activeRiskFactors(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
  if (typeof raw !== 'object') return []
  const out: string[] = []
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (NON_FACTOR_KEYS.has(k)) continue
    if (v === true) out.push(k)
    else if (typeof v === 'number' && v > 0 && k !== 'dormancyDays') out.push(k)
    else if (k === 'dormancyDays' && typeof v === 'number' && v >= 90) out.push(k)
  }
  return out
}

// ── Formatting helpers ──

function useDateFormatters() {
  const locale = useLocale()
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }), [locale])
  const relative = (val: string | null | undefined): string => {
    if (!val) return '-'
    const date = new Date(val)
    if (Number.isNaN(date.getTime())) return String(val)
    const diffSec = Math.round((date.getTime() - Date.now()) / 1000)
    const abs = Math.abs(diffSec)
    if (abs < 60) return t('justNow')
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
    if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
    if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month')
    return rtf.format(Math.round(diffSec / (86400 * 365)), 'year')
  }
  const absolute = (val: string | null | undefined): string => {
    if (!val) return ''
    const d = new Date(val)
    return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString(locale)
  }
  return { relative, absolute }
}

function DateDisplay({ value }: { value: string | null | undefined }) {
  const { relative, absolute } = useDateFormatters()
  if (!value) return <span className="text-[var(--text-secondary)]">-</span>
  return (
    <span title={absolute(value)} className="cursor-help underline decoration-dotted decoration-[var(--text-secondary)]">
      {relative(value)}
    </span>
  )
}

function BoolBadge({ value, trueLabel, falseLabel }: { value?: boolean | null; trueLabel?: string; falseLabel?: string }) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  if (value === undefined || value === null) return <span className="text-[var(--text-secondary)]">-</span>
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${value ? TONE.low : TONE.critical}`}>
      <span aria-hidden className={`shrink-0 w-1.5 h-1.5 rounded-full ${value ? 'bg-[var(--color-low)]' : 'bg-[var(--color-critical)]'}`} />
      {value ? (trueLabel || t('yes')) : (falseLabel || t('no'))}
    </span>
  )
}

function RiskScoreBar({ score }: { score?: number | null }) {
  if (score === undefined || score === null) return <span className="text-[var(--text-secondary)]">-</span>
  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low'
  return (
    <div className="flex items-center gap-2 w-36">
      <span className="text-sm font-bold min-w-[28px]" style={{ color: `color-mix(in srgb, var(--color-${level}) 60%, var(--text-primary))` }}>{score}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: `var(--color-${level})` }} />
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier?: string | null }) {
  const tTiers = useTranslations('tiers')
  if (!tier) return <span className="text-[var(--text-secondary)]">-</span>
  const tone = isControlPlaneTier(tier) ? TONE.critical : tier === 'tier_1' ? TONE.high : TONE.neutral
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${tone}`}>
      {tTiers.has(tier) ? tTiers(tier) : tier.replace('_', ' ').toUpperCase()}
    </span>
  )
}

const STATUS_DOT: Record<string, string> = {
  active: 'var(--color-low)', inactive: 'var(--text-secondary)', disabled: 'var(--color-critical)',
  dormant: 'var(--color-medium)', orphaned: 'var(--color-nhi)', suspended: 'var(--color-high)',
  open: 'var(--color-critical)', acknowledged: 'var(--color-medium)', remediated: 'var(--color-low)',
  excepted: 'var(--color-info)', false_positive: 'var(--text-secondary)', pending: 'var(--color-medium)',
  certified: 'var(--color-low)', revoked: 'var(--color-critical)', expired: 'var(--color-high)',
}

function StatusDot({ status }: { status?: string | null }) {
  const e = useTranslations('securityEnums')
  if (!status) return <span className="text-[var(--text-secondary)]">-</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="shrink-0 w-2 h-2 rounded-full" style={{ background: STATUS_DOT[status] ?? 'var(--text-secondary)' }} />
      <span className="text-xs">{label(e, 'statuses', status)}</span>
    </span>
  )
}

function PillBadges({ items, ns }: { items: string[]; ns?: string }) {
  const e = useTranslations('securityEnums')
  if (items.length === 0) return <span className="text-[var(--text-secondary)]">-</span>
  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {items.map((item) => (
        <span key={item} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
          {ns ? label(e, ns, item) : item.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  )
}

function SeverityBadge({ severity }: { severity?: string | null }) {
  const tSev = useTranslations('severity')
  if (!severity) return <span className="text-[var(--text-secondary)]">-</span>
  const tone = (TONE as Record<string, string>)[severity] ?? TONE.neutral
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${tone}`}>
      {tSev.has(severity) ? tSev(severity) : severity}
    </span>
  )
}

// ── Section and Row Components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h4 className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <span aria-hidden className="flex-1 h-px bg-[var(--border-default)]" />
        {title}
        <span aria-hidden className="flex-1 h-px bg-[var(--border-default)]" />
      </h4>
      <div className="space-y-0">{children}</div>
    </div>
  )
}

function Row({ label: rowLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-[var(--border-default)] last:border-0">
      <span className="text-[11px] text-[var(--text-secondary)] shrink-0 w-[120px]">{rowLabel}</span>
      <span className="text-[11px] text-[var(--text-primary)] text-end min-w-0 break-words">{children}</span>
    </div>
  )
}

function Text({ value }: { value?: string | null }) {
  return value ? <bdi>{value}</bdi> : <>-</>
}

// ── Node Type Icons ──

function NodeTypeIcon({ type }: { type: string }) {
  const iconClass = 'w-5 h-5'
  const d: Record<string, string> = {
    identity: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    resource: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2',
    group: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    violation: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z',
    account: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
  }
  return (
    <svg aria-hidden className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {d[type] ? <path strokeLinecap="round" strokeLinejoin="round" d={d[type]} /> : <circle cx="12" cy="12" r="10" />}
    </svg>
  )
}

// ── Connected Edges ──

const EDGE_TONE: Record<string, string> = {
  violation: TONE.critical, entitlement: TONE.info, membership: TONE.medium, account: TONE.neutral,
}

function ConnectedEdges({ nodeId, links, allNodes }: { nodeId: string; links: any[]; allNodes: any[] }) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const connected = useMemo(() => {
    if (!links || !allNodes) return []
    const nodeMap = new Map(allNodes.map(n => [n.id, n]))
    return links
      .map(l => {
        const sid = typeof l.source === 'string' ? l.source : l.source?.id
        const tid = typeof l.target === 'string' ? l.target : l.target?.id
        if (sid !== nodeId && tid !== nodeId) return null
        const otherNode = nodeMap.get(sid === nodeId ? tid : sid)
        return otherNode ? { link: l, otherNode, outgoing: sid === nodeId } : null
      })
      .filter((c): c is { link: any; otherNode: any; outgoing: boolean } => !!c)
  }, [nodeId, links, allNodes])

  if (connected.length === 0) return null

  return (
    <Section title={t('connections')}>
      <ul
        className="space-y-1 max-h-[200px] overflow-y-auto"
        tabIndex={0}
        aria-label={t('connections')}
      >
        {connected.map((c, i) => {
          // Outgoing points toward the reading direction's end; incoming toward its start.
          const Arrow = c.outgoing ? ArrowRight : ArrowLeft
          return (
            <li key={i} className="flex items-center gap-2 py-1 text-[11px]">
              <Arrow size={12} aria-label={c.outgoing ? t('outgoing') : t('incoming')} className="text-[var(--text-secondary)] flex-shrink-0 rtl:-scale-x-100" />
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${EDGE_TONE[c.link.type] ?? TONE.neutral}`}>
                {label(e, 'edgeTypes', c.link.type)}
              </span>
              <bdi className="text-[var(--text-primary)] truncate flex-1" title={c.otherNode.label}>
                {c.otherNode.label}
              </bdi>
              <span className="text-[var(--text-secondary)] text-[9px] shrink-0">
                {label(e, 'nodeTypes', c.otherNode.type)}
              </span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

// ── Node Detail Sections ──

function IdentityDetails({ node, links, allNodes }: { node: any; links?: any[]; allNodes?: any[] }) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const tId = useTranslations('identity')
  const p = node.properties || node
  const isHuman = p.type === 'human' || p.identityType === 'human'
  const subType = String(p.subType || p.type || '')
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="text-center pb-3 border-b border-[var(--border-default)]">
        <div
          aria-hidden
          className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-xl"
          style={{ background: isHuman ? 'var(--color-human)' : 'var(--color-nhi)' }}
        >
          {String(p.displayName || node.label || '?')[0].toUpperCase()}
        </div>
        <h3 className="font-semibold text-sm text-[var(--text-primary)]"><bdi>{p.displayName || node.label}</bdi></h3>
        {p.upn && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5"><bdi>{p.upn}</bdi></p>}
        <div className="flex gap-1.5 justify-center mt-2 flex-wrap">
          {subType && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${isHuman ? TONE.info : TONE.neutral}`}>
              {tId.has(subType) ? tId(subType) : subType.replace(/_/g, ' ')}
            </span>
          )}
          <StatusDot status={p.status} />
        </div>
      </div>

      {/* Security */}
      <Section title={t('security')}>
        <Row label={t('riskScore')}><RiskScoreBar score={p.riskScore} /></Row>
        <Row label={t('adTier')}><TierBadge tier={p.adTier} /></Row>
        <Row label={t('effectiveTier')}><TierBadge tier={p.effectiveTier} /></Row>
        <Row label={t('tierViolation')}><BoolBadge value={p.tierViolation == null ? p.tierViolation : !p.tierViolation} trueLabel={t('clean')} falseLabel={t('violation')} /></Row>
        <Row label={t('riskFactors')}><PillBadges items={activeRiskFactors(p.riskFactors)} ns="factors" /></Row>
      </Section>

      {/* Identity Info */}
      <Section title={t('identityInfo')}>
        <Row label={t('displayName')}><Text value={p.displayName} /></Row>
        <Row label={t('upn')}><Text value={p.upn} /></Row>
        <Row label={t('email')}><Text value={p.email} /></Row>
        <Row label={t('samAccount')}><Text value={p.samAccountName} /></Row>
        <Row label={t('department')}><Text value={p.department} /></Row>
        <Row label={t('sourceSystem')}><Text value={p.sourceSystem ? String(p.sourceSystem).replace(/_/g, ' ') : null} /></Row>
      </Section>

      {/* Timeline */}
      <Section title={t('timeline')}>
        <Row label={t('lastLogon')}><DateDisplay value={p.lastLogonAt} /></Row>
        <Row label={t('passwordSet')}><DateDisplay value={p.passwordLastSetAt} /></Row>
        <Row label={t('createdInSource')}><DateDisplay value={p.createdInSourceAt} /></Row>
        <Row label={t('expiry')}><DateDisplay value={p.expiryAt} /></Row>
        <Row label={t('created')}><DateDisplay value={p.createdAt} /></Row>
        <Row label={t('updated')}><DateDisplay value={p.updatedAt} /></Row>
      </Section>

      {links && allNodes && (
        <ConnectedEdges nodeId={node.id} links={links} allNodes={allNodes} />
      )}

      <Link
        href={`/dashboard/identities/${node.id}`}
        className="flex items-center justify-center gap-1 w-full py-2.5 mt-4 text-xs font-medium bg-[var(--color-info)] text-white rounded-lg hover:opacity-90 transition-opacity"
      >
        {t('viewFullDetail')}
        <ArrowRight size={12} aria-hidden className="rtl:-scale-x-100" />
      </Link>
    </div>
  )
}

function ResourceDetails({ node, links, allNodes }: { node: any; links?: any[]; allNodes?: any[] }) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const p = node.properties || node
  return (
    <div className="space-y-0">
      <div className="text-center pb-3 border-b border-[var(--border-default)]">
        <div aria-hidden className="w-14 h-14 rounded mx-auto mb-2 flex items-center justify-center text-white bg-[var(--color-tier2)]">
          <NodeTypeIcon type="resource" />
        </div>
        <h3 className="font-semibold text-sm text-[var(--text-primary)]"><bdi>{p.name || node.label}</bdi></h3>
      </div>

      <Section title={t('resourceInfo')}>
        <Row label={t('name')}><Text value={p.name} /></Row>
        <Row label={t('type')}>{p.resourceType ? label(e, 'resourceTypes', p.resourceType) : '-'}</Row>
        <Row label={t('adTier')}><TierBadge tier={p.adTier} /></Row>
        <Row label={t('criticality')}><SeverityBadge severity={p.criticality} /></Row>
        <Row label={t('environment')}>{p.environment ? label(e, 'environments', p.environment) : '-'}</Row>
      </Section>

      {links && allNodes && (
        <ConnectedEdges nodeId={node.id} links={links} allNodes={allNodes} />
      )}
    </div>
  )
}

function GroupDetails({ node, links, allNodes }: { node: any; links?: any[]; allNodes?: any[] }) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const p = node.properties || node
  return (
    <div className="space-y-0">
      <div className="text-center pb-3 border-b border-[var(--border-default)]">
        <div aria-hidden className="w-14 h-14 rounded mx-auto mb-2 flex items-center justify-center text-white" style={{ background: p.isPrivileged ? 'var(--color-critical)' : 'var(--color-medium)' }}>
          <NodeTypeIcon type="group" />
        </div>
        <h3 className="font-semibold text-sm text-[var(--text-primary)]"><bdi>{p.name || node.label}</bdi></h3>
        {p.isPrivileged && (
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${TONE.critical}`}>
            {t('privilegedBadge')}
          </span>
        )}
      </div>

      <Section title={t('groupInfo')}>
        <Row label={t('name')}><Text value={p.name} /></Row>
        <Row label={t('type')}>{p.groupType ? label(e, 'groupTypes', p.groupType) : '-'}</Row>
        <Row label={t('scope')}>{p.scope ? label(e, 'groupScopes', p.scope) : '-'}</Row>
        <Row label={t('adTier')}><TierBadge tier={p.groupTier || p.adTier} /></Row>
        <Row label={t('privileged')}><BoolBadge value={p.isPrivileged} /></Row>
        <Row label={t('members')}>{p.memberCount ?? '-'}</Row>
        <Row label={t('nestedGroups')}>{p.nestedGroupCount ?? '-'}</Row>
      </Section>

      {links && allNodes && (
        <ConnectedEdges nodeId={node.id} links={links} allNodes={allNodes} />
      )}
    </div>
  )
}

function ViolationDetails({ node, links, allNodes }: { node: any; links?: any[]; allNodes?: any[] }) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const p = node.properties || node
  const vType = p.violationType ? label(e, 'violationTypes', p.violationType) : t('violation')
  return (
    <div className="space-y-0">
      <div className="text-center pb-3 border-b border-[var(--border-default)]">
        <div aria-hidden className="w-14 h-14 rounded mx-auto mb-2 flex items-center justify-center text-white bg-[var(--color-critical)]">
          <NodeTypeIcon type="violation" />
        </div>
        <h3 className="font-semibold text-sm text-[var(--text-primary)]">{vType}</h3>
        <div className="flex gap-1.5 justify-center mt-2">
          <SeverityBadge severity={p.severity} />
          <StatusDot status={p.status} />
        </div>
      </div>

      <Section title={t('violationInfo')}>
        <Row label={t('type')}>{p.violationType ? vType : '-'}</Row>
        <Row label={t('severity')}><SeverityBadge severity={p.severity} /></Row>
        <Row label={t('status')}><StatusDot status={p.status} /></Row>
        <Row label={t('policy')}><Text value={p.policyName} /></Row>
        <Row label={t('policyType')}>{p.policyType ? label(e, 'violationTypes', p.policyType) : '-'}</Row>
      </Section>

      <Section title={t('timeline')}>
        <Row label={t('detected')}><DateDisplay value={p.detectedAt} /></Row>
        <Row label={t('remediated')}><DateDisplay value={p.remediatedAt} /></Row>
        {p.exceptionReason && (
          <Row label={t('exception')}><bdi>{p.exceptionReason}</bdi></Row>
        )}
      </Section>

      {links && allNodes && (
        <ConnectedEdges nodeId={node.id} links={links} allNodes={allNodes} />
      )}
    </div>
  )
}

function AccountDetails({ node, links, allNodes }: { node: any; links?: any[]; allNodes?: any[] }) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const p = node.properties || node
  return (
    <div className="space-y-0">
      <div className="text-center pb-3 border-b border-[var(--border-default)]">
        <div aria-hidden className="w-14 h-14 rounded mx-auto mb-2 flex items-center justify-center text-white bg-[var(--color-info)]">
          <NodeTypeIcon type="account" />
        </div>
        <h3 className="font-semibold text-sm text-[var(--text-primary)]"><bdi>{p.accountName || node.label}</bdi></h3>
        {p.platform && (
          <div className="flex gap-1.5 justify-center mt-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${TONE.info}`}>
              <bdi>{String(p.platform).replace(/_/g, ' ')}</bdi>
            </span>
          </div>
        )}
      </div>

      <Section title={t('accountInfo')}>
        <Row label={t('accountName')}><Text value={p.accountName} /></Row>
        <Row label={t('platform')}><Text value={p.platform ? String(p.platform).replace(/_/g, ' ') : null} /></Row>
        <Row label={t('accountType')}>{p.accountType ? label(e, 'accountTypes', p.accountType) : '-'}</Row>
        <Row label={t('enabled')}><BoolBadge value={p.enabled} trueLabel={t('enabledValue')} falseLabel={t('disabledValue')} /></Row>
        <Row label={t('mfaEnabled')}><BoolBadge value={p.mfaEnabled} trueLabel={t('mfaOn')} falseLabel={t('mfaOff')} /></Row>
        <Row label={t('privileged')}>
          {p.privileged == null ? '-' : (
            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${p.privileged ? TONE.high : TONE.neutral}`}>
              {p.privileged ? t('privilegedValue') : t('standardValue')}
            </span>
          )}
        </Row>
      </Section>

      <Section title={t('timeline')}>
        <Row label={t('lastAuth')}><DateDisplay value={p.lastAuthenticatedAt} /></Row>
      </Section>

      {links && allNodes && (
        <ConnectedEdges nodeId={node.id} links={links} allNodes={allNodes} />
      )}
    </div>
  )
}

// ── Main Panel ──

export function GraphDetailPanel({ node, links, allNodes, onClose, isOpen }: GraphDetailPanelProps) {
  const t = useTranslations('graphPanel')
  const e = useTranslations('securityEnums')
  const open = isOpen && !!node
  return (
    <aside
      aria-label={node ? t('panelTitle', { type: label(e, 'nodeTypes', node.type) }) : undefined}
      aria-hidden={!open}
      // Slides in from the inline end edge: right in LTR, left in RTL.
      className={`fixed top-0 end-0 h-full w-[400px] max-w-full bg-[var(--bg-primary)] border-s border-[var(--border-default)] shadow-xl z-40 transform transition-transform duration-200 ease-in-out overflow-y-auto ${
        open ? 'translate-x-0 visible' : 'translate-x-full rtl:-translate-x-full invisible'
      }`}
    >
      {node && (
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <NodeTypeIcon type={node.type} />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {t('panelTitle', { type: label(e, 'nodeTypes', node.type) })}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors"
              aria-label={t('close')}
            >
              <svg aria-hidden className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {node.type === 'identity' && <IdentityDetails node={node} links={links} allNodes={allNodes} />}
          {node.type === 'resource' && <ResourceDetails node={node} links={links} allNodes={allNodes} />}
          {node.type === 'group' && <GroupDetails node={node} links={links} allNodes={allNodes} />}
          {node.type === 'violation' && <ViolationDetails node={node} links={links} allNodes={allNodes} />}
          {node.type === 'account' && <AccountDetails node={node} links={links} allNodes={allNodes} />}
        </div>
      )}
    </aside>
  )
}
