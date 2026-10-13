import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import {
  policyViolations, policies, attackPaths, identityThreats,
  shadowAdmins, peerAnomalies, peerGroups, canaryTriggers,
  canaryIdentities, identities,
} from '@/lib/db/schema'
import { eq, and, desc, asc, sql, gte, lte, or, ilike, SQL } from 'drizzle-orm'
import { unauthorized } from '@/lib/actions/helpers'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

interface UnifiedResult {
  id: string
  findingType: 'violation' | 'attack_path' | 'threat' | 'shadow_admin' | 'peer_anomaly' | 'gpo_risk' | 'canary_trigger'
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: string
  identityId: string | null
  identityName: string | null
  identityType: string | null
  adTier: string | null
  effectiveTier: string | null
  tierViolation: boolean
  detectedAt: string
  resolvedAt: string | null
  category: string
  mitreTechnique: string | null
  riskScore: number | null
  sourceUrl: string
  metadata: Record<string, any>
}

function severityOrder(s: string): number {
  switch (s) {
    case 'critical': return 0
    case 'high': return 1
    case 'medium': return 2
    case 'low': return 3
    default: return 4
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()

    const orgId = session.user.orgId
    const params = req.nextUrl.searchParams

    const page = Math.max(1, parseInt(params.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') || '25')))
    const findingTypeFilter = params.get('findingType')?.split(',').filter(Boolean) || []
    const severityFilter = params.get('severity')?.split(',').filter(Boolean) || []
    const statusFilter = params.get('status') || ''
    const tierFilter = params.get('tier') || ''
    const identityIdFilter = params.get('identityId') || ''
    const search = params.get('search') || ''
    const sortBy = params.get('sortBy') || 'detectedAt'
    const sortOrder = params.get('sortOrder') || 'desc'
    const dateFrom = params.get('dateFrom') || ''
    const dateTo = params.get('dateTo') || ''

    // Determine which types to fetch
    const allTypes = ['violation', 'attack_path', 'threat', 'shadow_admin', 'peer_anomaly', 'gpo_risk', 'canary_trigger']
    const typesToFetch = findingTypeFilter.length > 0 ? findingTypeFilter : allTypes

    // Fetch all finding types in parallel
    const results: UnifiedResult[] = []

    const promises: Promise<void>[] = []

    // 1. Policy violations
    if (typesToFetch.includes('violation')) {
      promises.push((async () => {
        try {
          const rows = await db
            .select({
              id: policyViolations.id,
              violationType: policyViolations.violationType,
              severity: policyViolations.severity,
              status: policyViolations.status,
              detectedAt: policyViolations.detectedAt,
              remediatedAt: policyViolations.remediatedAt,
              policyName: policies.name,
              identityId: identities.id,
              identityName: identities.displayName,
              identityType: identities.type,
              adTier: identities.adTier,
              effectiveTier: identities.effectiveTier,
              tierViolation: identities.tierViolation,
            })
            .from(policyViolations)
            .leftJoin(policies, eq(policyViolations.policyId, policies.id))
            .leftJoin(identities, eq(policyViolations.identityId, identities.id))
            .where(eq(policyViolations.orgId, orgId))

          for (const r of rows) {
            results.push({
              id: r.id,
              findingType: 'violation',
              title: `${(r.violationType || '').replace(/_/g, ' ')} - ${r.policyName || 'Unknown policy'}`,
              severity: (r.severity as any) || 'medium',
              status: r.status || 'open',
              identityId: r.identityId,
              identityName: r.identityName,
              identityType: r.identityType,
              adTier: r.adTier,
              effectiveTier: r.effectiveTier,
              tierViolation: r.tierViolation ?? false,
              detectedAt: r.detectedAt?.toISOString() || new Date().toISOString(),
              resolvedAt: r.remediatedAt?.toISOString() || null,
              category: r.violationType || 'unknown',
              mitreTechnique: null,
              riskScore: null,
              sourceUrl: `/dashboard/violations`,
              metadata: { policyName: r.policyName, violationType: r.violationType },
            })
          }
        } catch (err) {
          console.error('[Results] Failed to fetch violations:', err)
        }
      })())
    }

    // 2. Attack paths
    if (typesToFetch.includes('attack_path')) {
      promises.push((async () => {
        try {
          const rows = await db
            .select({
              id: attackPaths.id,
              sourceIdentityId: attackPaths.sourceIdentityId,
              riskScore: attackPaths.riskScore,
              attackTechnique: attackPaths.attackTechnique,
              mitreId: attackPaths.mitreId,
              pathLength: attackPaths.pathLength,
              status: attackPaths.status,
              discoveredAt: attackPaths.discoveredAt,
              pathNodes: attackPaths.pathNodes,
              sourceIdentityName: identities.displayName,
              sourceIdentityType: identities.type,
              sourceAdTier: identities.adTier,
              sourceEffectiveTier: identities.effectiveTier,
              sourceTierViolation: identities.tierViolation,
            })
            .from(attackPaths)
            .leftJoin(identities, eq(attackPaths.sourceIdentityId, identities.id))
            .where(eq(attackPaths.orgId, orgId))

          for (const r of rows) {
            const nodes = r.pathNodes as any[]
            const targetName = nodes?.[nodes.length - 1]?.name || 'Unknown'
            const sev: 'critical' | 'high' | 'medium' | 'low' =
              r.riskScore >= 80 ? 'critical' : r.riskScore >= 60 ? 'high' : r.riskScore >= 40 ? 'medium' : 'low'

            results.push({
              id: r.id,
              findingType: 'attack_path',
              title: `${r.sourceIdentityName || 'Unknown'} -> ${targetName} (${r.attackTechnique})`,
              severity: sev,
              status: r.status || 'open',
              identityId: r.sourceIdentityId,
              identityName: r.sourceIdentityName,
              identityType: r.sourceIdentityType,
              adTier: r.sourceAdTier,
              effectiveTier: r.sourceEffectiveTier,
              tierViolation: r.sourceTierViolation ?? false,
              detectedAt: r.discoveredAt?.toISOString() || new Date().toISOString(),
              resolvedAt: null,
              category: r.attackTechnique || 'unknown',
              mitreTechnique: r.mitreId,
              riskScore: r.riskScore,
              sourceUrl: `/dashboard/attack-paths/${r.id}`,
              metadata: { pathLength: r.pathLength, attackTechnique: r.attackTechnique, mitreId: r.mitreId },
            })
          }
        } catch (err) {
          console.error('[Results] Failed to fetch attack paths:', err)
        }
      })())
    }

    // 3. Identity threats
    if (typesToFetch.includes('threat')) {
      promises.push((async () => {
        try {
          const rows = await db
            .select({
              id: identityThreats.id,
              threatType: identityThreats.threatType,
              severity: identityThreats.severity,
              status: identityThreats.status,
              identityId: identityThreats.identityId,
              identityName: identities.displayName,
              identityType: identities.type,
              adTier: identities.adTier,
              effectiveTier: identities.effectiveTier,
              tierViolation: identities.tierViolation,
              killChainPhase: identityThreats.killChainPhase,
              confidence: identityThreats.confidence,
              mitreTechniqueIds: identityThreats.mitreTechniqueIds,
              mitreTechniqueName: identityThreats.mitreTechniqueName,
              sourceIp: identityThreats.sourceIp,
              firstSeenAt: identityThreats.firstSeenAt,
              lastSeenAt: identityThreats.lastSeenAt,
            })
            .from(identityThreats)
            .leftJoin(identities, eq(identityThreats.identityId, identities.id))
            .where(eq(identityThreats.orgId, orgId))

          for (const r of rows) {
            results.push({
              id: r.id,
              findingType: 'threat',
              title: `${(r.threatType || '').replace(/_/g, ' ')} - ${r.killChainPhase?.replace(/_/g, ' ') || 'Unknown phase'}`,
              severity: (r.severity as any) || 'medium',
              status: r.status || 'active',
              identityId: r.identityId,
              identityName: r.identityName,
              identityType: r.identityType,
              adTier: r.adTier,
              effectiveTier: r.effectiveTier,
              tierViolation: r.tierViolation ?? false,
              detectedAt: r.firstSeenAt?.toISOString() || new Date().toISOString(),
              resolvedAt: r.status === 'resolved' ? r.lastSeenAt?.toISOString() || null : null,
              category: r.threatType || 'unknown',
              mitreTechnique: (r.mitreTechniqueIds as string[] | null)?.[0] || null,
              riskScore: r.confidence,
              sourceUrl: `/dashboard/threats/${r.id}`,
              metadata: {
                threatType: r.threatType,
                killChainPhase: r.killChainPhase,
                confidence: r.confidence,
                sourceIp: r.sourceIp,
                mitreTechniqueName: r.mitreTechniqueName,
              },
            })
          }
        } catch (err) {
          console.error('[Results] Failed to fetch threats:', err)
        }
      })())
    }

    // 4. Shadow admins
    if (typesToFetch.includes('shadow_admin')) {
      promises.push((async () => {
        try {
          const rows = await db
            .select({
              id: shadowAdmins.id,
              identityId: shadowAdmins.identityId,
              identityName: identities.displayName,
              identityType: identities.type,
              adTier: identities.adTier,
              effectiveTier: identities.effectiveTier,
              tierViolation: identities.tierViolation,
              detectionMethod: shadowAdmins.detectionMethod,
              effectiveRights: shadowAdmins.effectiveRights,
              equivalentToGroups: shadowAdmins.equivalentToGroups,
              riskScore: shadowAdmins.riskScore,
              status: shadowAdmins.status,
              detectedAt: shadowAdmins.detectedAt,
            })
            .from(shadowAdmins)
            .innerJoin(identities, eq(shadowAdmins.identityId, identities.id))
            .where(eq(shadowAdmins.orgId, orgId))

          for (const r of rows) {
            const sev: 'critical' | 'high' | 'medium' | 'low' =
              r.riskScore >= 80 ? 'critical' : r.riskScore >= 60 ? 'high' : r.riskScore >= 40 ? 'medium' : 'low'

            results.push({
              id: r.id,
              findingType: 'shadow_admin',
              title: `Shadow Admin: ${r.identityName} (${(r.detectionMethod || '').replace(/_/g, ' ')})`,
              severity: sev,
              status: r.status || 'open',
              identityId: r.identityId,
              identityName: r.identityName,
              identityType: r.identityType,
              adTier: r.adTier,
              effectiveTier: r.effectiveTier,
              tierViolation: r.tierViolation ?? false,
              detectedAt: r.detectedAt?.toISOString() || new Date().toISOString(),
              resolvedAt: r.status === 'remediated' ? r.detectedAt?.toISOString() || null : null,
              category: r.detectionMethod || 'unknown',
              mitreTechnique: null,
              riskScore: r.riskScore,
              sourceUrl: `/dashboard/shadow-admins`,
              metadata: {
                detectionMethod: r.detectionMethod,
                effectiveRights: r.effectiveRights,
                equivalentToGroups: r.equivalentToGroups,
              },
            })
          }
        } catch (err) {
          console.error('[Results] Failed to fetch shadow admins:', err)
        }
      })())
    }

    // 5. Peer anomalies
    if (typesToFetch.includes('peer_anomaly')) {
      promises.push((async () => {
        try {
          const rows = await db
            .select({
              id: peerAnomalies.id,
              identityId: peerAnomalies.identityId,
              identityName: identities.displayName,
              identityType: identities.type,
              adTier: identities.adTier,
              effectiveTier: identities.effectiveTier,
              tierViolation: identities.tierViolation,
              identityDepartment: identities.department,
              peerGroupName: peerGroups.name,
              anomalyType: peerAnomalies.anomalyType,
              entitlementCount: peerAnomalies.entitlementCount,
              peerMedian: peerAnomalies.peerMedian,
              deviationScore: peerAnomalies.deviationScore,
              excessEntitlements: peerAnomalies.excessEntitlements,
              status: peerAnomalies.status,
              detectedAt: peerAnomalies.detectedAt,
            })
            .from(peerAnomalies)
            .innerJoin(identities, eq(peerAnomalies.identityId, identities.id))
            .innerJoin(peerGroups, eq(peerAnomalies.peerGroupId, peerGroups.id))
            .where(eq(peerAnomalies.orgId, orgId))

          for (const r of rows) {
            const sev: 'critical' | 'high' | 'medium' | 'low' =
              (r.deviationScore || 0) >= 3 ? 'high' : (r.deviationScore || 0) >= 2 ? 'medium' : 'low'

            results.push({
              id: r.id,
              findingType: 'peer_anomaly',
              title: `Peer Anomaly: ${r.identityName} (${r.entitlementCount} vs ${r.peerMedian} median)`,
              severity: sev,
              status: r.status || 'open',
              identityId: r.identityId,
              identityName: r.identityName,
              identityType: r.identityType,
              adTier: r.adTier,
              effectiveTier: r.effectiveTier,
              tierViolation: r.tierViolation ?? false,
              detectedAt: r.detectedAt?.toISOString() || new Date().toISOString(),
              resolvedAt: null,
              category: r.anomalyType || 'excess_entitlements',
              mitreTechnique: null,
              riskScore: r.deviationScore ? Math.round(r.deviationScore * 20) : null,
              sourceUrl: `/dashboard/peer-analysis`,
              metadata: {
                peerGroupName: r.peerGroupName,
                entitlementCount: r.entitlementCount,
                peerMedian: r.peerMedian,
                deviationScore: r.deviationScore,
                excessEntitlements: r.excessEntitlements,
                department: r.identityDepartment,
              },
            })
          }
        } catch (err) {
          console.error('[Results] Failed to fetch peer anomalies:', err)
        }
      })())
    }

    // 6. GPO risks - use the risks endpoint logic inline
    if (typesToFetch.includes('gpo_risk')) {
      promises.push((async () => {
        try {
          // Dynamically import to handle case where GPO tables may not exist
          const { gpoObjects, gpoLinks, gpoPermissions } = await import('@/lib/db/schema')

          const dangerousPerms = await db
            .select({
              gpoId: gpoPermissions.gpoId,
              gpoName: gpoObjects.name,
              gpoTier: gpoObjects.adTier,
              trusteeName: gpoPermissions.trusteeName,
              trusteeIdentityId: gpoPermissions.trusteeIdentityId,
              permissionType: gpoPermissions.permissionType,
              dangerous: gpoPermissions.dangerous,
              identityName: identities.displayName,
              identityType: identities.type,
              identityTier: identities.adTier,
              identityEffectiveTier: identities.effectiveTier,
              identityTierViolation: identities.tierViolation,
            })
            .from(gpoPermissions)
            .innerJoin(gpoObjects, eq(gpoPermissions.gpoId, gpoObjects.id))
            .leftJoin(identities, eq(gpoPermissions.trusteeIdentityId, identities.id))
            .where(and(
              eq(gpoPermissions.orgId, orgId),
              eq(gpoPermissions.dangerous, true),
            ))

          for (const r of dangerousPerms) {
            const sev: 'critical' | 'high' | 'medium' | 'low' =
              r.gpoTier === 'tier_0' ? 'critical' : r.gpoTier === 'tier_1' ? 'high' : 'medium'

            results.push({
              id: `gpo-${r.gpoId}-${r.trusteeName}`,
              findingType: 'gpo_risk',
              title: `GPO Risk: ${r.trusteeName} has dangerous permission on "${r.gpoName}"`,
              severity: sev,
              status: 'open',
              identityId: r.trusteeIdentityId,
              identityName: r.identityName || r.trusteeName,
              identityType: r.identityType,
              adTier: r.identityTier,
              effectiveTier: r.identityEffectiveTier,
              tierViolation: r.identityTierViolation ?? false,
              detectedAt: new Date().toISOString(),
              resolvedAt: null,
              category: 'dangerous_gpo_permission',
              mitreTechnique: null,
              riskScore: sev === 'critical' ? 90 : sev === 'high' ? 70 : 50,
              sourceUrl: `/dashboard/gpo`,
              metadata: {
                gpoName: r.gpoName,
                gpoTier: r.gpoTier,
                permissionType: r.permissionType,
                trusteeName: r.trusteeName,
              },
            })
          }
        } catch (err) {
          // GPO tables may not exist - skip gracefully
          console.warn('[Results] GPO tables not available:', (err as Error).message)
        }
      })())
    }

    // 7. Canary triggers
    if (typesToFetch.includes('canary_trigger')) {
      promises.push((async () => {
        try {
          const rows = await db
            .select({
              id: canaryTriggers.id,
              canaryId: canaryTriggers.canaryId,
              eventType: canaryTriggers.eventType,
              sourceIp: canaryTriggers.sourceIp,
              sourceHostname: canaryTriggers.sourceHostname,
              triggeredAt: canaryTriggers.triggeredAt,
              investigated: canaryTriggers.investigated,
              canaryType: canaryIdentities.canaryType,
              canaryDescription: canaryIdentities.description,
              canaryIdentityId: canaryIdentities.identityId,
              identityName: identities.displayName,
              identityType: identities.type,
              adTier: identities.adTier,
            })
            .from(canaryTriggers)
            .innerJoin(canaryIdentities, eq(canaryTriggers.canaryId, canaryIdentities.id))
            .leftJoin(identities, eq(canaryIdentities.identityId, identities.id))
            .where(eq(canaryTriggers.orgId, orgId))

          for (const r of rows) {
            results.push({
              id: r.id,
              findingType: 'canary_trigger',
              title: `Canary Triggered: ${r.identityName || 'Unknown'} (${(r.canaryType || '').replace(/_/g, ' ')})`,
              severity: 'critical',
              status: r.investigated ? 'investigated' : 'open',
              identityId: r.canaryIdentityId,
              identityName: r.identityName,
              identityType: r.identityType,
              adTier: r.adTier,
              effectiveTier: null,
              tierViolation: false,
              detectedAt: r.triggeredAt?.toISOString() || new Date().toISOString(),
              resolvedAt: r.investigated ? r.triggeredAt?.toISOString() || null : null,
              category: r.canaryType || 'unknown',
              mitreTechnique: null,
              riskScore: 95,
              sourceUrl: `/dashboard/canaries`,
              metadata: {
                canaryType: r.canaryType,
                sourceIp: r.sourceIp,
                sourceHostname: r.sourceHostname,
                eventType: r.eventType,
                canaryDescription: r.canaryDescription,
              },
            })
          }
        } catch (err) {
          console.error('[Results] Failed to fetch canary triggers:', err)
        }
      })())
    }

    await Promise.all(promises)

    // Apply client-side filters
    let filtered = results

    if (severityFilter.length > 0) {
      filtered = filtered.filter(r => severityFilter.includes(r.severity))
    }
    if (statusFilter) {
      filtered = filtered.filter(r => r.status === statusFilter)
    }
    if (tierFilter) {
      filtered = filtered.filter(r => r.adTier === tierFilter)
    }
    if (identityIdFilter) {
      filtered = filtered.filter(r => r.identityId === identityIdFilter)
    }
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter(r =>
        r.title.toLowerCase().includes(s) ||
        (r.identityName || '').toLowerCase().includes(s)
      )
    }
    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      filtered = filtered.filter(r => new Date(r.detectedAt) >= fromDate)
    }
    if (dateTo) {
      const toDate = new Date(dateTo)
      filtered = filtered.filter(r => new Date(r.detectedAt) <= toDate)
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'severity':
          comparison = severityOrder(a.severity) - severityOrder(b.severity)
          break
        case 'riskScore':
          comparison = (b.riskScore || 0) - (a.riskScore || 0)
          break
        case 'identityName':
          comparison = (a.identityName || '').localeCompare(b.identityName || '')
          break
        case 'detectedAt':
        default:
          comparison = new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
          break
      }
      return sortOrder === 'asc' ? -comparison : comparison
    })

    // Build summary from ALL filtered results (before pagination)
    const summary = {
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      byTier: {} as Record<string, number>,
    }

    for (const r of filtered) {
      summary.bySeverity[r.severity] = (summary.bySeverity[r.severity] || 0) + 1
      summary.byType[r.findingType] = (summary.byType[r.findingType] || 0) + 1
      summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1
      if (r.adTier) {
        summary.byTier[r.adTier] = (summary.byTier[r.adTier] || 0) + 1
      }
    }

    // Paginate
    const total = filtered.length
    const offset = (page - 1) * pageSize
    const paginated = filtered.slice(offset, offset + pageSize)

    return NextResponse.json({
      results: paginated,
      total,
      page,
      pageSize,
      summary,
    })
  } catch (error) {
    console.error('[Results Hub] GET error:', error)
    return NextResponse.json({ error: 'Failed to load results' }, { status: 500 })
  }
}
