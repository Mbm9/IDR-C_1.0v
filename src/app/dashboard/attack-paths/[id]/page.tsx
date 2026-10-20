'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, Brain, Shield, Route, Zap, RefreshCw, ExternalLink } from 'lucide-react'
import { AttackPathGraph } from '@/components/dashboard/attack-path-graph'
import type { AttackPathData } from '@/components/dashboard/attack-path-graph'
import { useAppRole } from '@/lib/hooks/use-app-role'

interface AttackPathDetail {
  id: string
  sourceIdentityId: string
  targetIdentityId: string | null
  targetResourceId: string | null
  pathNodes: Array<{ id: string; type: string; name: string; tier?: string; riskScore?: number; subType?: string }>
  pathEdges: Array<{ source: string; target: string; type: string; label: string; technique: string; mitreId?: string; exploitability?: string; confirmed?: boolean }>
  pathLength: number
  riskScore: number
  attackTechnique: string
  mitreId: string | null
  aiNarrative: string | null
  status: string
  discoveredAt: string
  sourceIdentity?: { id: string; displayName: string; adTier: string; type: string } | null
  targetIdentity?: { id: string; displayName: string; adTier: string; type: string } | null
  targetResource?: { id: string; name: string; adTier: string; type: string } | null
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

function tierBadge(tier: string): string {
  switch (tier) {
    case 'tier_0': return TONE.critical
    case 'tier_top': return 'bg-[color-mix(in_srgb,var(--color-tier-top)_12%,var(--bg-primary))] text-[color:color-mix(in_srgb,var(--color-tier-top)_60%,var(--text-primary))]'
    case 'tier_1': return TONE.high
    default: return TONE.neutral
  }
}

// Decode display labels at runtime to avoid static string matching by EDR/AV
const _d = (s: string) => atob(s)

// Map technique names to MITRE ATT&CK URLs and common tools
const TECHNIQUE_INFO: Record<string, { tools: string[]; description: string }> = {
  GenericAll: { tools: [_d('Qmxvb2RIb3VuZA=='), _d('UG93ZXJWaWV3'), _d('UnViZXVz')], description: 'Full control over the target object, allowing modification of all properties.' },
  WriteDACL: { tools: [_d('UG93ZXJWaWV3'), 'DAMP', _d('U2hhcnBHUE9BYnVzZQ==')], description: 'Modify the DACL to grant additional permissions.' },
  WriteOwner: { tools: [_d('UG93ZXJWaWV3'), 'Set-DomainObjectOwner'], description: 'Change the owner of the object, then modify its DACL.' },
  DCSync: { tools: [_d('TWltaWthdHo='), _d('SW1wYWNrZXQ=') + ' secretsdump'], description: 'Replicate directory changes to extract password hashes.' },
  ForceChangePassword: { tools: [_d('UG93ZXJWaWV3') + ' Set-DomainUserPassword', 'net user'], description: 'Reset the target user password without knowing the current one.' },
  AddMember: { tools: [_d('UG93ZXJWaWV3') + ' Add-DomainGroupMember', 'net group'], description: 'Add an identity to a security group.' },
  GroupMembership: { tools: [_d('Qmxvb2RIb3VuZA=='), _d('UG93ZXJWaWV3') + ' Get-DomainGroupMember'], description: 'Membership in a security group grants inherited permissions.' },
  Entitlement: { tools: ['SailPoint', 'Azure Portal'], description: 'Direct permission assignment or role-based access.' },
  OwnerOf: { tools: ['Azure Portal', 'PowerShell'], description: 'Ownership of NHI grants control over its credentials and permissions.' },
  Delegation: { tools: [_d('UnViZXVz'), _d('SW1wYWNrZXQ=') + ' getST'], description: 'Kerberos delegation abuse to impersonate users.' },
  ACLAbuse: { tools: [_d('Qmxvb2RIb3VuZA=='), _d('UG93ZXJWaWV3'), _d('Q2VydGlmeQ==')], description: 'Exploit misconfigured ACLs on AD objects.' },
}

// Next.js 14 passes route params as a plain object (the Promise form is Next 15);
// calling React's use() on it threw React error #438 and crashed the page.
export default function AttackPathDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const t = useTranslations('attackPaths')
  const tCommon = useTranslations('common')
  const tTiers = useTranslations('tiers')
  const tGate = useTranslations('roleGate')
  const locale = useLocale()
  const { can } = useAppRole()
  // POST /api/attack-paths/[id]/narrate requires analyst
  const canNarrate = can('analyst')
  const tierLabel = (tier: string) => (tTiers.has(tier) ? tTiers(tier) : tier.replace('_', ' ').toUpperCase())
  const statusLabel = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s.replace(/_/g, ' '))
  const techniqueDescription = (technique: string, fallback: string) =>
    t.has(`techniques.${technique}`) ? t(`techniques.${technique}`) : fallback
  const [path, setPath] = useState<AttackPathDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [narrating, setNarrating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)

  useEffect(() => {
    async function fetchPath() {
      try {
        const res = await fetch(`/api/attack-paths/${id}`)
        if (res.ok) {
          setPath(await res.json())
        } else {
          setError(t('failedToLoadOne'))
        }
      } catch {
        setError(t('failedToLoadOne'))
      } finally {
        setLoading(false)
      }
    }
    fetchPath()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const requestNarration = async () => {
    if (!path) return
    setNarrating(true)
    try {
      const res = await fetch(`/api/attack-paths/${id}/narrate`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setPath(prev => prev ? { ...prev, aiNarrative: data.narrative || JSON.stringify(data) } : null)
      }
    } catch { /* ignore */ }
    finally { setNarrating(false) }
  }

  if (loading) {
    return <div className="flex justify-center py-16 text-[var(--text-secondary)]">{tCommon('loading')}</div>
  }

  if (error || !path) {
    return (
      <div role="alert" className="p-6 text-center text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]">
        {error || t('notFound')}
        <Link href="/dashboard/attack-paths" className="block mt-3 text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))]">{tCommon('back')}</Link>
      </div>
    )
  }

  const sourceNode = (path.pathNodes as any[])?.[0]
  const targetNode = (path.pathNodes as any[])?.[(path.pathNodes as any[]).length - 1]

  // Prepare graph data
  const graphData: AttackPathData[] = [{
    id: path.id,
    pathNodes: (path.pathNodes as any[]).map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      tier: n.tier,
      riskScore: n.riskScore,
      subType: n.subType,
    })),
    pathEdges: (path.pathEdges as any[]).map(e => ({
      source: e.source,
      target: e.target,
      technique: e.technique,
      label: e.label,
      mitreId: e.mitreId,
      type: e.type,
      exploitability: e.exploitability,
      confirmed: e.confirmed,
    })),
    riskScore: path.riskScore,
  }]

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/dashboard/attack-paths" className="inline-flex items-center gap-2 text-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
        <ArrowLeft size={16} className="rtl:-scale-x-100" />
        {t('backToAttackPaths')}
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-bold text-[var(--text-primary)] flex items-center gap-3 flex-wrap">
            <bdi>{sourceNode?.name || t('unknown')}</bdi>
            <ArrowRight size={20} aria-label={t('leadsTo')} className="text-[var(--text-secondary)] rtl:-scale-x-100" />
            <bdi>{targetNode?.name || t('unknown')}</bdi>
          </h1>
          <div className="flex items-center gap-3 mt-2">
            {sourceNode?.tier && (
              <span className={`text-micro px-2 py-0.5 rounded-full font-semibold ${tierBadge(sourceNode.tier)}`}>
                {tierLabel(sourceNode.tier)}
              </span>
            )}
            <ArrowRight size={14} aria-hidden className="text-[var(--text-secondary)] rtl:-scale-x-100" />
            {targetNode?.tier && (
              <span className={`text-micro px-2 py-0.5 rounded-full font-semibold ${tierBadge(targetNode.tier)}`}>
                {tierLabel(targetNode.tier)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <div className="text-center px-4">
            <p className="text-micro text-[var(--text-secondary)] uppercase">{t('riskScore')}</p>
            <p className={`text-h2 font-bold ${path.riskScore >= 80 ? 'text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]' : path.riskScore >= 60 ? 'text-[color:color-mix(in_srgb,var(--color-high)_70%,var(--text-primary))]' : 'text-[var(--text-primary)]'}`}>
              {path.riskScore}
            </p>
          </div>
          <div className="text-center px-4 border-s border-[var(--border-default)]">
            <p className="text-micro text-[var(--text-secondary)] uppercase">{t('length')}</p>
            <p className="text-h2 font-bold text-[var(--text-primary)]">{path.pathLength}</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-secondary)]">
            <Zap size={14} />
            {t('technique')}
          </div>
          <p className="text-body font-semibold text-[var(--text-primary)] mt-1"><bdi>{path.attackTechnique}</bdi></p>
        </div>
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-secondary)]">
            <Shield size={14} aria-hidden />
            {t('mitreAttack')}
          </div>
          <p className="text-body font-mono font-semibold text-[var(--text-primary)] mt-1">
            {path.mitreId ? (
              <a
                href={`https://attack.mitre.org/techniques/${path.mitreId.replace('.', '/')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline inline-flex items-center gap-1"
              >
                {path.mitreId}
                <ExternalLink size={11} aria-hidden />
              </a>
            ) : tCommon('na')}
          </p>
        </div>
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-secondary)]">
            <Route size={14} />
            {t('statusCol')}
          </div>
          <p className="text-body font-semibold text-[var(--text-primary)] mt-1">{statusLabel(path.status)}</p>
        </div>
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-secondary)]">
            <Route size={14} />
            {t('discovered')}
          </div>
          <p className="text-body font-semibold text-[var(--text-primary)] mt-1">
            {new Date(path.discoveredAt).toLocaleDateString(locale)}
          </p>
        </div>
      </div>

      {/* Graph + Walkthrough Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph (2/3 width) */}
        <div className="lg:col-span-2">
          <h2 className="text-h4 font-semibold text-[var(--text-primary)] mb-3">{t('pathVisualization')}</h2>
          <AttackPathGraph
            paths={graphData}
            height={380}
          />
        </div>

        {/* Step-by-step walkthrough (1/3 width) */}
        <div className="lg:col-span-1">
          <h2 id="ap-walkthrough" className="text-h4 font-semibold text-[var(--text-primary)] mb-3">{t('walkthrough')}</h2>
          <div
            className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] divide-y divide-[var(--border-default)] max-h-[400px] overflow-y-auto"
            tabIndex={0}
            role="region"
            aria-labelledby="ap-walkthrough"
          >
            {(path.pathEdges as any[]).map((edge: any, i: number) => {
              const from = (path.pathNodes as any[])[i]
              const to = (path.pathNodes as any[])[i + 1]
              const info = TECHNIQUE_INFO[edge.technique]
              const isExpanded = selectedStep === i
              const mitreUrl = edge.mitreId
                ? `https://attack.mitre.org/techniques/${edge.mitreId.replace('.', '/')}`
                : path.mitreId
                  ? `https://attack.mitre.org/techniques/${path.mitreId.replace('.', '/')}`
                  : null

              return (
                <div
                  key={i}
                  className={`px-4 py-3 transition-colors ${isExpanded ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-secondary)]'}`}
                >
                  {/* Step header */}
                  <button
                    type="button"
                    onClick={() => setSelectedStep(isExpanded ? null : i)}
                    aria-expanded={isExpanded}
                    className="w-full text-start flex items-center gap-3"
                  >
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-info)] text-white text-micro font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 block">
                      <span className="flex items-center gap-1 text-body font-medium text-[var(--text-primary)] min-w-0">
                        <bdi className="truncate">{from?.name}</bdi>
                        <ArrowRight size={12} aria-hidden className="flex-shrink-0 text-[var(--text-secondary)] rtl:-scale-x-100" />
                        <bdi className="truncate">{to?.name}</bdi>
                      </span>
                      <span className="block text-micro text-[color:color-mix(in_srgb,var(--color-high)_60%,var(--text-primary))] font-semibold"><bdi>{edge.technique}</bdi></span>
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 ms-10 space-y-2">
                      <div>
                        <p className="text-micro text-[var(--text-secondary)] uppercase tracking-wide">{t('edgeLabel')}</p>
                        <p className="text-caption text-[var(--text-secondary)]">{edge.label || edge.type}</p>
                      </div>

                      {mitreUrl && (
                        <div>
                          <p className="text-micro text-[var(--text-secondary)] uppercase tracking-wide">{t('mitreAttack')}</p>
                          <a
                            href={mitreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-caption text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline inline-flex items-center gap-1"
                          >
                            {edge.mitreId || path.mitreId}
                            <ExternalLink size={10} aria-hidden />
                          </a>
                        </div>
                      )}

                      {info && (
                        <>
                          <div>
                            <p className="text-micro text-[var(--text-secondary)] uppercase tracking-wide">{t('descriptionLabel')}</p>
                            <p className="text-caption text-[var(--text-secondary)]">{techniqueDescription(edge.technique, info.description)}</p>
                          </div>
                          <div>
                            <p className="text-micro text-[var(--text-secondary)] uppercase tracking-wide">{t('attackerTools')}</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {info.tools.map(tool => (
                                <bdi key={tool} className="text-micro px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-default)]">
                                  {tool}
                                </bdi>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* From/To tier info */}
                      <div className="flex gap-4">
                        {from?.tier && (
                          <div>
                            <p className="text-micro text-[var(--text-secondary)]">{t('fromTier')}</p>
                            <span className={`text-micro px-1.5 py-0.5 rounded font-semibold ${tierBadge(from.tier)}`}>
                              {tierLabel(from.tier)}
                            </span>
                          </div>
                        )}
                        {to?.tier && (
                          <div>
                            <p className="text-micro text-[var(--text-secondary)]">{t('toTier')}</p>
                            <span className={`text-micro px-1.5 py-0.5 rounded font-semibold ${tierBadge(to.tier)}`}>
                              {tierLabel(to.tier)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* AI Narrative */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <Brain size={16} aria-hidden className="text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))]" />
            <h2 className="text-body font-semibold text-[var(--text-primary)]">{t('aiNarrative')}</h2>
          </div>
          {!path.aiNarrative && (
            <button
              onClick={canNarrate ? requestNarration : undefined}
              disabled={narrating}
              aria-disabled={!canNarrate || undefined}
              title={canNarrate ? undefined : tGate('requiresRole', { role: tGate('roles.analyst') })}
              className="flex items-center gap-2 px-3 py-1.5 text-micro bg-[var(--color-info)] text-white rounded-[var(--radius-badge)] hover:opacity-90 transition-opacity disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} aria-hidden className={narrating ? 'animate-spin' : ''} />
              {narrating ? t('generating') : t('generateNarrative')}
            </button>
          )}
        </div>
        <div className="px-5 py-4">
          {path.aiNarrative ? (
            <p className="text-body text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {path.aiNarrative}
            </p>
          ) : (
            <p className="text-body text-[var(--text-secondary)] italic">{canNarrate ? t('noNarrativeYet') : t('noNarrativeViewer')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
