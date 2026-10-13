'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { IdentityGraph, type GraphLayout, type GraphNode, type GraphLink } from '@/components/dashboard/identity-graph'
import { GraphDetailPanel } from '@/components/dashboard/graph-detail-panel'
import { CardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { AD_TIERS } from '@/lib/utils/tiers'

// ── Edge Tooltip Component ──

function useRelative() {
  const locale = useLocale()
  const t = useTranslations('graph')
  return (val: any) => {
    if (!val) return '-'
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return String(val)
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    const days = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (days > 365) return rtf.format(-Math.floor(days / 365), 'year')
    if (days > 30) return rtf.format(-Math.floor(days / 30), 'month')
    if (days > 0) return rtf.format(-days, 'day')
    return t('today')
  }
}

const EDGE_TONE: Record<string, string> = {
  violation: 'bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]',
  entitlement: 'bg-[var(--color-info-bg)] text-[color:color-mix(in_srgb,var(--color-info)_60%,var(--text-primary))]',
  membership: 'bg-[var(--color-medium-bg)] text-[color:color-mix(in_srgb,var(--color-medium)_60%,var(--text-primary))]',
}
const sevColor = (sev: string) => `color-mix(in srgb, var(--color-${['critical', 'high', 'medium', 'low'].includes(sev) ? sev : 'low'}) 60%, var(--text-primary))`

function EdgeTooltip({ link, x, y }: { link: GraphLink; x: number; y: number }) {
  const p = link.properties || {}
  const t = useTranslations('graph')
  const tEnum = useTranslations('securityEnums')
  const tTiers = useTranslations('tiers')
  const tSev = useTranslations('severity')
  const formatDate = useRelative()
  const en = (ns: string, v: string) => (tEnum.has(`${ns}.${v}`) ? tEnum(`${ns}.${v}`) : String(v).replace(/_/g, ' '))

  return (
    <div
      className="fixed z-[60] bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-3 text-[11px] text-[var(--text-primary)] pointer-events-none min-w-[200px] max-w-[280px]"
      style={{ left: Math.min(x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 290), top: y + 12, boxShadow: 'var(--shadow-dropdown)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${EDGE_TONE[link.type] ?? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
          {en('edgeTypes', link.type)}
        </span>
        {link.label && <bdi className="text-[var(--text-primary)] font-medium truncate">{link.label}</bdi>}
      </div>

      {link.type === 'entitlement' && (
        <div className="space-y-1">
          {p.permissionName && <div><span className="text-[var(--text-secondary)]">{t('tipPermission')}:</span> <bdi>{p.permissionName}</bdi></div>}
          {p.permissionType && <div><span className="text-[var(--text-secondary)]">{t('tipType')}:</span> <bdi>{String(p.permissionType).replace(/_/g, ' ')}</bdi></div>}
          {p.adTierOfPermission && <div><span className="text-[var(--text-secondary)]">{t('tipTier')}:</span> {tTiers.has(p.adTierOfPermission) ? tTiers(p.adTierOfPermission) : p.adTierOfPermission}</div>}
          {p.certificationStatus && (
            <div>
              <span className="text-[var(--text-secondary)]">{t('tipCert')}:</span>{' '}
              <span style={{ color: sevColor(p.certificationStatus === 'certified' ? 'low' : p.certificationStatus === 'expired' || p.certificationStatus === 'revoked' ? 'critical' : 'medium') }}>
                {en('statuses', p.certificationStatus)}
              </span>
            </div>
          )}
          {p.lastUsedAt && <div><span className="text-[var(--text-secondary)]">{t('tipLastUsed')}:</span> {formatDate(p.lastUsedAt)}</div>}
          {p.riskTags && p.riskTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(p.riskTags as string[]).map((tag: string, i: number) => (
                <span key={i} className={`px-1 py-0.5 rounded-full text-[9px] ${EDGE_TONE.violation}`}>{String(tag).replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {link.type === 'membership' && (
        <div className="space-y-1">
          {p.membershipType && <div><span className="text-[var(--text-secondary)]">{t('tipType')}:</span> <bdi>{String(p.membershipType).replace(/_/g, ' ')}</bdi></div>}
          {p.addedAt && <div><span className="text-[var(--text-secondary)]">{t('tipAdded')}:</span> {formatDate(p.addedAt)}</div>}
          {p.addedBy && <div><span className="text-[var(--text-secondary)]">{t('tipAddedBy')}:</span> <bdi>{p.addedBy}</bdi></div>}
        </div>
      )}

      {link.type === 'violation' && (
        <div className="space-y-1">
          {p.violationType && <div><span className="text-[var(--text-secondary)]">{t('tipType')}:</span> {en('violationTypes', p.violationType)}</div>}
          {p.severity && (
            <div>
              <span className="text-[var(--text-secondary)]">{t('tipSeverity')}:</span>{' '}
              <span className="font-medium" style={{ color: sevColor(p.severity) }}>{tSev.has(p.severity) ? tSev(p.severity) : p.severity}</span>
            </div>
          )}
          {p.status && <div><span className="text-[var(--text-secondary)]">{t('tipStatus')}:</span> {en('statuses', p.status)}</div>}
        </div>
      )}

      {link.type === 'account' && (
        <div className="space-y-1">
          {p.platform && <div><span className="text-[var(--text-secondary)]">{t('tipPlatform')}:</span> <bdi>{String(p.platform).replace(/_/g, ' ')}</bdi></div>}
          {p.accountType && <div><span className="text-[var(--text-secondary)]">{t('tipType')}:</span> {en('accountTypes', p.accountType)}</div>}
          <div><span className="text-[var(--text-secondary)]">{t('tipMfa')}:</span> {p.mfaEnabled ? <span style={{ color: sevColor('low') }}>{t('enabled')}</span> : <span style={{ color: sevColor('critical') }}>{t('disabled')}</span>}</div>
          {p.privileged && <div className="font-medium" style={{ color: sevColor('critical') }}>{t('privileged')}</div>}
        </div>
      )}

      {(link.type === 'manager' || link.type === 'owner') && (
        <div className="text-[var(--text-secondary)] italic"><bdi>{link.label || en('edgeTypes', link.type)}</bdi></div>
      )}
    </div>
  )
}

// ── Context Menu ──

function ContextMenu({ node, x, y, onClose }: { node: GraphNode; x: number; y: number; onClose: () => void }) {
  const t = useTranslations('graph')
  const tEnum = useTranslations('securityEnums')
  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} aria-hidden />
      <div
        role="menu"
        className="fixed z-[80] bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg shadow-lg py-1 min-w-[180px]"
        style={{ left: x, top: y, boxShadow: 'var(--shadow-dropdown)' }}
      >
        <div className="px-3 py-1.5 border-b border-[var(--border-default)]">
          <p className="text-[11px] font-medium text-[var(--text-primary)] truncate"><bdi>{node.label}</bdi></p>
          <p className="text-[10px] text-[var(--text-secondary)]">{tEnum.has(`nodeTypes.${node.type}`) ? tEnum(`nodeTypes.${node.type}`) : node.type}</p>
        </div>
        {node.type === 'identity' && (
          <button
            role="menuitem"
            autoFocus
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors text-start"
            onClick={() => {
              window.location.href = `/dashboard/identities/${node.id}`
              onClose()
            }}
          >
            <svg aria-hidden className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {t('viewDetail')}
          </button>
        )}
      </div>
    </>
  )
}

// ── Stats Panel ──

function StatsPanel({ nodes, links }: { nodes: any[]; links: any[] }) {
  const [collapsed, setCollapsed] = useState(true)
  const t = useTranslations('graph')
  const tEnum = useTranslations('securityEnums')
  const tTiers = useTranslations('tiers')
  const en = (ns: string, v: string) => (tEnum.has(`${ns}.${v}`) ? tEnum(`${ns}.${v}`) : String(v).replace(/_/g, ' '))

  const stats = useMemo(() => {
    const nodesByType: Record<string, number> = {}
    const edgesByType: Record<string, number> = {}
    let totalRisk = 0
    let identityCount = 0
    const tierCounts: Record<string, number> = Object.fromEntries(AD_TIERS.map((k) => [k, 0]))
    const violationTypes: Record<string, number> = {}

    for (const n of nodes) {
      nodesByType[n.type] = (nodesByType[n.type] || 0) + 1
      if (n.type === 'identity') {
        totalRisk += n.riskScore || 0
        identityCount++
        const t = n.tier || 'unclassified'
        tierCounts[t] = (tierCounts[t] || 0) + 1
      }
      if (n.type === 'violation' && n.subType) {
        violationTypes[n.subType] = (violationTypes[n.subType] || 0) + 1
      }
    }

    for (const l of links) {
      edgesByType[l.type] = (edgesByType[l.type] || 0) + 1
    }

    const avgRisk = identityCount > 0 ? Math.round(totalRisk / identityCount) : 0

    const topViolations = Object.entries(violationTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return { nodesByType, edgesByType, avgRisk, identityCount, tierCounts, topViolations }
  }, [nodes, links])

  return (
    <div className="border border-[var(--border-default)] rounded-[var(--radius-card)] bg-[var(--bg-primary)] overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <span>{t('graphStatistics')}</span>
        <svg aria-hidden className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-5 gap-4 border-t border-[var(--border-default)] pt-3">
          {/* Nodes by type */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t('statNodes')}</p>
            <div className="space-y-1">
              {Object.entries(stats.nodesByType).map(([type, count]) => (
                <div key={type} className="flex justify-between text-[11px]">
                  <span className="text-[var(--text-secondary)]">{en('nodeTypes', type)}</span>
                  <span className="text-[var(--text-primary)] font-medium">{count}</span>
                </div>
              ))}
              <div className="flex justify-between text-[11px] border-t border-[var(--border-default)] pt-1 mt-1">
                <span className="text-[var(--text-secondary)] font-medium">{t('statTotal')}</span>
                <span className="text-[var(--text-primary)] font-bold">{Object.values(stats.nodesByType).reduce((a, b) => a + b, 0)}</span>
              </div>
            </div>
          </div>

          {/* Edges by type */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t('statEdges')}</p>
            <div className="space-y-1">
              {Object.entries(stats.edgesByType).map(([type, count]) => (
                <div key={type} className="flex justify-between text-[11px]">
                  <span className="text-[var(--text-secondary)]">{en('edgeTypes', type)}</span>
                  <span className="text-[var(--text-primary)] font-medium">{count}</span>
                </div>
              ))}
              <div className="flex justify-between text-[11px] border-t border-[var(--border-default)] pt-1 mt-1">
                <span className="text-[var(--text-secondary)] font-medium">{t('statTotal')}</span>
                <span className="text-[var(--text-primary)] font-bold">{Object.values(stats.edgesByType).reduce((a, b) => a + b, 0)}</span>
              </div>
            </div>
          </div>

          {/* Avg risk */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t('statAvgRisk')}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: sevColor(stats.avgRisk >= 80 ? 'critical' : stats.avgRisk >= 60 ? 'high' : stats.avgRisk >= 40 ? 'medium' : 'low') }}>{stats.avgRisk}</span>
              <span className="text-[10px] text-[var(--text-secondary)]">/ 100</span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{t('identitiesCount', { count: stats.identityCount })}</p>
          </div>

          {/* Tier distribution */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t('statTiers')}</p>
            <div className="space-y-1">
              {Object.entries(stats.tierCounts).map(([tier, count]) => (
                <div key={tier} className="flex justify-between text-[11px]">
                  <span className="font-medium" style={{ color: tier === 'tier_0' ? sevColor('critical') : tier === 'tier_top' ? 'color-mix(in srgb, var(--color-tier-top) 60%, var(--text-primary))' : tier === 'tier_1' ? sevColor('high') : 'var(--text-secondary)' }}>
                    {tTiers.has(tier) ? tTiers(tier) : tier.replace('_', ' ')}
                  </span>
                  <span className="text-[var(--text-primary)] font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top violations */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1.5">{t('statTopViolations')}</p>
            {stats.topViolations.length > 0 ? (
              <div className="space-y-1">
                {stats.topViolations.map(([type, count]) => (
                  <div key={type} className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-secondary)] truncate">{en('violationTypes', type)}</span>
                    <span className="font-medium shrink-0 ms-2" style={{ color: sevColor('critical') }}>{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-secondary)]">{t('none')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Layout Toggle Buttons ──

const LAYOUT_OPTIONS: { key: GraphLayout; label: 'layoutForce' | 'layoutHierarchy' | 'layoutRadial'; icon: string }[] = [
  { key: 'force', label: 'layoutForce', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'hierarchical', label: 'layoutHierarchy', icon: 'M3 4h18M3 12h18M3 20h18' },
  { key: 'radial', label: 'layoutRadial', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z' },
]

function LayoutToggle({ layout, onChange }: { layout: GraphLayout; onChange: (l: GraphLayout) => void }) {
  const t = useTranslations('graph')
  return (
    <div role="group" aria-label={t('layout')} className="inline-flex border border-[var(--border-default)] rounded-lg overflow-hidden">
      {LAYOUT_OPTIONS.map(opt => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          aria-pressed={layout === opt.key}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors ${
            layout === opt.key
              ? 'bg-[var(--color-info)] text-white'
              : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <svg aria-hidden className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
          </svg>
          {t(opt.label)}
        </button>
      ))}
    </div>
  )
}

// ── Export Functionality ──

function ExportMenu({ svgRef, nodes, links }: { svgRef: React.RefObject<SVGSVGElement | null>; nodes: any[]; links: any[] }) {
  const [open, setOpen] = useState(false)
  const t = useTranslations('graph')

  const exportPNG = useCallback(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      ctx.scale(2, 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, img.width, img.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = 'identity-graph.png'
      a.click()
    }
    img.src = url
    setOpen(false)
  }, [svgRef])

  const exportSVG = useCallback(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'identity-graph.svg'
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }, [svgRef])

  const exportJSON = useCallback(() => {
    const data = { nodes, links: links.map(l => ({ ...l, source: typeof l.source === 'string' ? l.source : (l.source as any)?.id, target: typeof l.target === 'string' ? l.target : (l.target as any)?.id })) }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'identity-graph-data.json'
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }, [nodes, links])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border border-[var(--border-default)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <svg aria-hidden className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {t('export')}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute end-0 top-full mt-1 z-[80] bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg shadow-lg py-1 min-w-[140px]">
            <button role="menuitem" onClick={exportPNG} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] text-start">
              <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {t('exportPng')}
            </button>
            <button role="menuitem" onClick={exportSVG} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] text-start">
              <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              {t('exportSvg')}
            </button>
            <button role="menuitem" onClick={exportJSON} className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] text-start">
              <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              {t('exportJson')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Page ──

export default function GraphPage() {
  const [limit, setLimit] = useState(50)
  const [tier, setTier] = useState('')
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [graphLayout, setGraphLayout] = useState<GraphLayout>('force')
  const [edgeTooltip, setEdgeTooltip] = useState<{ link: GraphLink; x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<string[]>([
    'entitlement', 'membership', 'manager', 'owner', 'violation', 'account',
  ])
  const graphSvgRef = useRef<SVGSVGElement | null>(null)
  const t = useTranslations('graph')
  const tTiers = useTranslations('tiers')

  const EDGE_TYPES = [
    { key: 'entitlement', label: t('entitlements'), color: '#94a3b8' },
    { key: 'membership', label: t('memberships'), color: '#cbd5e1' },
    { key: 'manager', label: t('manager'), color: '#3B82F6' },
    { key: 'owner', label: t('ownerEdge'), color: '#8B5CF6' },
    { key: 'violation', label: t('violationsEdge'), color: '#DC2626' },
    { key: 'account', label: t('accountsEdge'), color: '#4F46E5' },
  ] as const

  const { data, isLoading, error } = useQuery({
    queryKey: ['graph', limit, tier],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (tier) params.set('tier', tier)
      const res = await fetch(`/api/graph?${params}`)
      if (!res.ok) throw new Error('Failed to load graph data')
      return res.json()
    },
  })

  // Filter nodes by search query
  const filteredData = useMemo(() => {
    if (!data?.nodes) return data
    if (!searchQuery.trim()) return data

    const q = searchQuery.toLowerCase()
    const matchedNodeIds = new Set<string>()
    const filteredNodes = data.nodes.filter((n: any) => {
      const matches = n.label.toLowerCase().includes(q)
      if (matches) matchedNodeIds.add(n.id)
      return matches
    })

    const connectedNodeIds = new Set<string>(matchedNodeIds)
    for (const link of data.links) {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      if (matchedNodeIds.has(sourceId)) connectedNodeIds.add(targetId)
      if (matchedNodeIds.has(targetId)) connectedNodeIds.add(sourceId)
    }

    const expandedNodes = data.nodes.filter((n: any) => connectedNodeIds.has(n.id))
    const expandedLinks = data.links.filter((l: any) => {
      const sourceId = typeof l.source === 'string' ? l.source : l.source.id
      const targetId = typeof l.target === 'string' ? l.target : l.target.id
      return connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId)
    })

    return { nodes: expandedNodes, links: expandedLinks }
  }, [data, searchQuery])

  function toggleEdgeType(edgeType: string) {
    setVisibleEdgeTypes(prev =>
      prev.includes(edgeType)
        ? prev.filter(t => t !== edgeType)
        : [...prev, edgeType]
    )
  }

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node)
    setContextMenu(null)
  }, [])

  const handleNodeDoubleClick = useCallback((node: GraphNode) => {
    if (node.type === 'identity') {
      window.location.href = `/dashboard/identities/${node.id}`
    }
  }, [])

  const handleNodeRightClick = useCallback((node: GraphNode, x: number, y: number) => {
    setContextMenu({ node, x, y })
  }, [])

  const handleEdgeHover = useCallback((link: GraphLink | null, x: number, y: number) => {
    if (link) {
      setEdgeTooltip({ link, x, y })
    } else {
      setEdgeTooltip(null)
    }
  }, [])

  function handleClosePanel() {
    setSelectedNode(null)
  }

  // Capture SVG ref from the graph component
  const graphContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      const svg = el.querySelector('svg')
      if (svg) graphSvgRef.current = svg
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
          <p className="text-caption text-[var(--text-secondary)]">
            {t('description')}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <LayoutToggle layout={graphLayout} onChange={setGraphLayout} />
          <ExportMenu svgRef={graphSvgRef} nodes={filteredData?.nodes || []} links={filteredData?.links || []} />
          <select
            aria-label={t('tierFilter')}
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-input)] text-caption bg-[var(--bg-primary)]"
          >
            <option value="">{tTiers('allTiers')}</option>
            <option value="tier_0">{tTiers('tier_0')}</option>
            <option value="tier_top">{tTiers('tier_top')}</option>
            <option value="tier_1">{tTiers('tier_1')}</option>
            <option value="tier_2">{tTiers('tier_2')}</option>
          </select>
          <select
            aria-label={t('limitFilter')}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-input)] text-caption bg-[var(--bg-primary)]"
          >
            <option value={25}>{t('identitiesCount', { count: 25 })}</option>
            <option value={50}>{t('identitiesCount', { count: 50 })}</option>
            <option value={100}>{t('identitiesCount', { count: 100 })}</option>
          </select>
        </div>
      </div>

      {/* Search and edge type filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg aria-hidden className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchNodes')}
            aria-label={t('searchNodes')}
            className="w-full ps-9 pe-3 py-2 border border-[var(--border-default)] rounded-[var(--radius-input)] text-caption bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
          />
        </div>

        <div role="group" aria-label={t('edges')} className="flex items-center gap-3 flex-wrap">
          <span aria-hidden className="text-xs text-[var(--text-secondary)]">{t('edges')}:</span>
          {EDGE_TYPES.map(et => (
            <label key={et.key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={visibleEdgeTypes.includes(et.key)}
                onChange={() => toggleEdgeType(et.key)}
                className="rounded border-[var(--border-default)] text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] w-3.5 h-3.5"
              />
              <span className="text-xs text-[var(--text-secondary)]">{et.label}</span>
              <span aria-hidden className="w-4 h-0.5 rounded" style={{ background: et.color }} />
            </label>
          ))}
        </div>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : error ? (
        <EmptyState
          icon="default"
          title={t('failedToLoad')}
          description={t('failedDescription')}
        />
      ) : !filteredData?.nodes?.length ? (
        <EmptyState
          icon="identities"
          title={searchQuery ? t('noMatchingNodes') : t('noIdentitiesToVisualize')}
          description={searchQuery ? t('tryDifferentSearch') : t('importIdentities')}
          actionLabel={searchQuery ? undefined : t('goToIdentities')}
          actionHref={searchQuery ? undefined : '/dashboard/identities'}
        />
      ) : (
        <div className="relative" ref={graphContainerRef}>
          <p className="text-caption text-[var(--text-secondary)] mb-2">
            {t('nodesCount', { nodes: filteredData.nodes.length })} &middot; {t('connectionsCount', { connections: filteredData.links.length })} &middot; {t('clickToView')} &middot; {t('dragToRearrange')} &middot; {t('scrollToZoom')}
          </p>
          <IdentityGraph
            nodes={filteredData.nodes}
            links={filteredData.links}
            height={600}
            layout={graphLayout}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeRightClick={handleNodeRightClick}
            onEdgeHover={handleEdgeHover}
            visibleEdgeTypes={visibleEdgeTypes}
          />
        </div>
      )}

      {/* Stats Panel */}
      {filteredData?.nodes?.length > 0 && (
        <StatsPanel nodes={filteredData.nodes} links={filteredData.links} />
      )}

      {/* Edge tooltip */}
      {edgeTooltip && (
        <EdgeTooltip link={edgeTooltip.link} x={edgeTooltip.x} y={edgeTooltip.y} />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          node={contextMenu.node}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      <GraphDetailPanel
        node={selectedNode}
        links={filteredData?.links}
        allNodes={filteredData?.nodes}
        isOpen={!!selectedNode}
        onClose={handleClosePanel}
      />
    </div>
  )
}
