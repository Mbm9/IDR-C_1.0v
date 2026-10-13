'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight, ChevronDown, FolderTree, FileText } from 'lucide-react'
import { isControlPlaneTier, isStricterTier } from '@/lib/utils/tiers'

interface GpoLink {
  id: string
  gpoId: string
  gpoName: string
  gpoTier: string
  linkedOu: string
  linkOrder: number
  enforced: boolean
  linkEnabled: boolean
  adTierOfOu: string
}

interface GpoLinksTreeProps {
  links: GpoLink[]
}

interface OuTreeNode {
  name: string
  dn: string
  tier: string
  children: OuTreeNode[]
  gpos: Array<{ id: string; name: string; tier: string; enforced: boolean; linkEnabled: boolean; dangerous: boolean }>
}

const TIER_COLORS: Record<string, string> = {
  tier_0: '#DC2626',
  tier_top: '#BE123C',
  tier_1: '#EA580C',
  tier_2: '#6B7280',
  unclassified: '#9CA3AF',
}

// Badge tones built from theme tokens so they keep AA contrast in light and dark themes.
const tone = (c: string) => `bg-[var(--color-${c}-bg)] text-[color:color-mix(in_srgb,var(--color-${c})_60%,var(--text-primary))]`
const NEUTRAL = 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
const TIER_BADGE: Record<string, string> = {
  tier_0: `${tone('critical')} border-[var(--color-critical)]/30`,
  tier_top: 'bg-[color-mix(in_srgb,var(--color-tier-top)_12%,var(--bg-primary))] text-[color:color-mix(in_srgb,var(--color-tier-top)_60%,var(--text-primary))] border-[var(--color-tier-top)]/30',
  tier_1: `${tone('high')} border-[var(--color-high)]/30`,
  tier_2: `${NEUTRAL} border-[var(--border-default)]`,
  unclassified: `${NEUTRAL} border-[var(--border-default)]`,
}

function parseDnToPath(dn: string): string[] {
  // Parse "OU=Servers,OU=Corp,DC=acmefs,DC=local" into path parts
  const parts = dn.split(',').reverse()
  const path: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith('DC=')) {
      path.push(trimmed.replace('DC=', ''))
    } else if (trimmed.startsWith('OU=')) {
      path.push(trimmed.replace('OU=', ''))
    } else if (trimmed.startsWith('CN=')) {
      path.push(trimmed.replace('CN=', ''))
    }
  }
  return path
}

function buildTree(links: GpoLink[]): OuTreeNode {
  const root: OuTreeNode = { name: 'Domain', dn: '', tier: 'unclassified', children: [], gpos: [] }

  for (const link of links) {
    const pathParts = parseDnToPath(link.linkedOu)
    let current = root

    // Walk down the tree, creating nodes as needed
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      let child = current.children.find(c => c.name === part)
      if (!child) {
        child = {
          name: part,
          dn: pathParts.slice(0, i + 1).join('.'),
          tier: 'unclassified',
          children: [],
          gpos: [],
        }
        current.children.push(child)
      }
      current = child
    }

    // Set the tier of the leaf OU from the link
    current.tier = link.adTierOfOu

    // Dangerous: a less privileged GPO applied to a Tier 0 / Top Tier OU
    const dangerous = isControlPlaneTier(link.adTierOfOu) && isStricterTier(link.adTierOfOu, link.gpoTier)

    current.gpos.push({
      id: link.gpoId,
      name: link.gpoName,
      tier: link.gpoTier,
      enforced: link.enforced,
      linkEnabled: link.linkEnabled,
      dangerous,
    })
  }

  return root
}

function TreeNode({ node, depth = 0 }: { node: OuTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 3)
  const t = useTranslations('gpo')
  const tTiers = useTranslations('tiers')
  const hasChildren = node.children.length > 0 || node.gpos.length > 0
  const tierColor = TIER_COLORS[node.tier] || TIER_COLORS.unclassified

  return (
    <div className="select-none">
      <button
        type="button"
        aria-expanded={hasChildren ? expanded : undefined}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors text-start"
        style={{ paddingInlineStart: `${depth * 20 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown aria-hidden size={14} className="text-[var(--text-secondary)] flex-shrink-0" /> : <ChevronRight aria-hidden size={14} className="text-[var(--text-secondary)] flex-shrink-0 rtl:-scale-x-100" />
        ) : (
          <span aria-hidden className="w-[14px]" />
        )}
        <FolderTree aria-hidden size={14} style={{ color: tierColor }} className="flex-shrink-0" />
        <bdi className="text-caption font-medium text-[var(--text-primary)] truncate">{node.name}</bdi>
        {node.tier !== 'unclassified' && (
          <span className={`text-micro px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${TIER_BADGE[node.tier] || TIER_BADGE.unclassified}`}>
            {tTiers.has(node.tier) ? tTiers(node.tier) : node.tier.replace('_', ' ').toUpperCase()}
          </span>
        )}
        {node.gpos.length > 0 && (
          <span className="text-micro text-[var(--text-secondary)]">({t('gposCount', { count: node.gpos.length })})</span>
        )}
      </button>

      {expanded && (
        <div>
          {/* GPOs linked to this OU */}
          {node.gpos.map((gpo) => (
            <Link
              key={`${node.dn}-${gpo.id}`}
              href={`/dashboard/gpo/${gpo.id}`}
              className={`flex items-center gap-2 py-1 px-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors ${gpo.dangerous ? 'bg-[var(--color-critical-bg)]' : ''}`}
              style={{ paddingInlineStart: `${(depth + 1) * 20 + 8}px` }}
            >
              <FileText aria-hidden size={13} className="flex-shrink-0" style={{ color: TIER_COLORS[gpo.tier] || '#6B7280' }} />
              <bdi className={`text-caption truncate ${gpo.dangerous ? 'text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))] font-medium' : 'text-[var(--text-secondary)]'}`}>
                {gpo.name}
              </bdi>
              {gpo.enforced && (
                <span className={`text-micro px-1 py-0.5 rounded border border-[var(--color-info)]/30 font-medium ${tone('info')}`}>
                  {t('treeEnforced')}
                </span>
              )}
              {!gpo.linkEnabled && (
                <span className={`text-micro px-1 py-0.5 rounded border border-[var(--border-default)] font-medium ${NEUTRAL}`}>
                  {t('treeDisabled')}
                </span>
              )}
              {gpo.dangerous && (
                <span className={`text-micro px-1 py-0.5 rounded border border-[var(--color-critical)]/30 font-medium ${tone('critical')}`}>
                  {t('treeRisk')}
                </span>
              )}
            </Link>
          ))}
          {/* Child OUs */}
          {node.children.map((child) => (
            <TreeNode key={child.dn} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function GpoLinksTree({ links }: GpoLinksTreeProps) {
  const tree = useMemo(() => buildTree(links), [links])
  const t = useTranslations('gpo')

  if (links.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--text-secondary)]">
        <FolderTree aria-hidden size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-body">{t('noLinks')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {tree.children.map((child) => (
        <TreeNode key={child.dn} node={child} depth={0} />
      ))}
      {tree.gpos.length > 0 && (
        <TreeNode node={tree} depth={0} />
      )}
    </div>
  )
}
