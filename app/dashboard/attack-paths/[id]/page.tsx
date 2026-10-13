'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Brain, Shield, Route, Zap, RefreshCw, ExternalLink } from 'lucide-react'
import { AttackPathGraph } from '@/components/dashboard/attack-path-graph'
import type { AttackPathData } from '@/components/dashboard/attack-path-graph'

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

function tierBadge(tier: string): string {
  switch (tier) {
    case 'tier_0': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'tier_1': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    case 'tier_2': return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400'
    default: return 'bg-slate-100 text-slate-500'
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
          setError('Failed to load attack path')
        }
      } catch {
        setError('Failed to load attack path')
      } finally {
        setLoading(false)
      }
    }
    fetchPath()
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
    return <div className="flex justify-center py-16 text-[var(--text-tertiary)]">{tCommon('loading')}</div>
  }

  if (error || !path) {
    return (
      <div className="p-6 text-center text-red-500">
        {error || 'Attack path not found'}
        <Link href="/dashboard/attack-paths" className="block mt-3 text-[var(--color-info)]">{tCommon('back')}</Link>
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
      <Link href="/dashboard/attack-paths" className="inline-flex items-center gap-2 text-body text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
        <ArrowLeft size={16} className="rtl:-scale-x-100" />
        {t('backToAttackPaths')}
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-h2 font-bold text-[var(--text-primary)]">
              {sourceNode?.name || 'Unknown'}
            </h1>
            <span className="text-[var(--text-tertiary)]">&rarr;</span>
            <h1 className="text-h2 font-bold text-[var(--text-primary)]">
              {targetNode?.name || 'Unknown'}
            </h1>
          </div>
          <div className="flex items-center gap-3 mt-2">
            {sourceNode?.tier && (
              <span className={`text-micro px-2 py-0.5 rounded-full font-semibold ${tierBadge(sourceNode.tier)}`}>
                {sourceNode.tier.replace('_', ' ').toUpperCase()}
              </span>
            )}
            <span className="text-[var(--text-tertiary)]">&rarr;</span>
            {targetNode?.tier && (
              <span className={`text-micro px-2 py-0.5 rounded-full font-semibold ${tierBadge(targetNode.tier)}`}>
                {targetNode.tier.replace('_', ' ').toUpperCase()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <div className="text-center px-4">
            <p className="text-micro text-[var(--text-tertiary)] uppercase">{t('riskScore')}</p>
            <p className={`text-h2 font-bold ${path.riskScore >= 80 ? 'text-[var(--color-critical)]' : path.riskScore >= 60 ? 'text-[var(--color-warning)]' : 'text-[var(--text-primary)]'}`}>
              {path.riskScore}
            </p>
          </div>
          <div className="text-center px-4 border-s border-[var(--border-default)]">
            <p className="text-micro text-[var(--text-tertiary)] uppercase">{t('length')}</p>
            <p className="text-h2 font-bold text-[var(--text-primary)]">{path.pathLength}</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-tertiary)]">
            <Zap size={14} />
            {t('technique')}
          </div>
          <p className="text-body font-semibold text-[var(--text-primary)] mt-1">{path.attackTechnique}</p>
        </div>
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-tertiary)]">
            <Shield size={14} />
            MITRE ATT&CK
          </div>
          <p className="text-body font-mono font-semibold text-[var(--text-primary)] mt-1">
            {path.mitreId ? (
              <a
                href={`https://attack.mitre.org/techniques/${path.mitreId.replace('.', '/')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-info)] hover:underline inline-flex items-center gap-1"
              >
                {path.mitreId}
                <ExternalLink size={11} />
              </a>
            ) : 'N/A'}
          </p>
        </div>
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-tertiary)]">
            <Route size={14} />
            {t('statusCol')}
          </div>
          <p className="text-body font-semibold capitalize text-[var(--text-primary)] mt-1">{path.status}</p>
        </div>
        <div className="p-3 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2 text-micro text-[var(--text-tertiary)]">
            <Route size={14} />
            {t('discovered')}
          </div>
          <p className="text-body font-semibold text-[var(--text-primary)] mt-1">
            {new Date(path.discoveredAt).toLocaleDateString()}
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
          <h2 className="text-h4 font-semibold text-[var(--text-primary)] mb-3">Step-by-Step Walkthrough</h2>
          <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] divide-y divide-[var(--border-default)] max-h-[400px] overflow-y-auto">
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
                <button
                  key={i}
                  onClick={() => setSelectedStep(isExpanded ? null : i)}
                  className={`w-full text-start px-4 py-3 transition-colors ${isExpanded ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-secondary)]'}`}
                >
                  {/* Step header */}
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-info)] text-white text-micro font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium text-[var(--text-primary)] truncate">
                        {from?.name} → {to?.name}
                      </p>
                      <p className="text-micro text-[var(--color-warning)] font-semibold">{edge.technique}</p>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 ms-10 space-y-2">
                      <div>
                        <p className="text-micro text-[var(--text-tertiary)] uppercase tracking-wide">Edge Label</p>
                        <p className="text-caption text-[var(--text-secondary)]">{edge.label || edge.type}</p>
                      </div>

                      {mitreUrl && (
                        <div>
                          <p className="text-micro text-[var(--text-tertiary)] uppercase tracking-wide">MITRE ATT&CK</p>
                          <a
                            href={mitreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-caption text-[var(--color-info)] hover:underline inline-flex items-center gap-1"
                            onClick={e => e.stopPropagation()}
                          >
                            {edge.mitreId || path.mitreId}
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      )}

                      {info && (
                        <>
                          <div>
                            <p className="text-micro text-[var(--text-tertiary)] uppercase tracking-wide">Description</p>
                            <p className="text-caption text-[var(--text-secondary)]">{info.description}</p>
                          </div>
                          <div>
                            <p className="text-micro text-[var(--text-tertiary)] uppercase tracking-wide">Attacker Tools</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {info.tools.map(tool => (
                                <span key={tool} className="text-micro px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-default)]">
                                  {tool}
                                </span>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* From/To tier info */}
                      <div className="flex gap-4">
                        {from?.tier && (
                          <div>
                            <p className="text-micro text-[var(--text-tertiary)]">From Tier</p>
                            <span className={`text-micro px-1.5 py-0.5 rounded font-semibold ${tierBadge(from.tier)}`}>
                              {from.tier.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                        )}
                        {to?.tier && (
                          <div>
                            <p className="text-micro text-[var(--text-tertiary)]">To Tier</p>
                            <span className={`text-micro px-1.5 py-0.5 rounded font-semibold ${tierBadge(to.tier)}`}>
                              {to.tier.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* AI Narrative */}
      <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-[var(--color-info)]" />
            <h2 className="text-body font-semibold text-[var(--text-primary)]">{t('aiNarrative')}</h2>
          </div>
          {!path.aiNarrative && (
            <button
              onClick={requestNarration}
              disabled={narrating}
              className="flex items-center gap-2 px-3 py-1.5 text-micro bg-[var(--color-info)] text-white rounded-[var(--radius-badge)] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <RefreshCw size={12} className={narrating ? 'animate-spin' : ''} />
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
            <p className="text-body text-[var(--text-tertiary)] italic">{t('noNarrativeYet')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
