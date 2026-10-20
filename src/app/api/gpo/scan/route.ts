import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { gpoObjects, gpoLinks, gpoPermissions, identities, policyViolations, policies } from '@/lib/db/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { unauthorized, forbidden, logAction } from '@/lib/actions/helpers'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { isStricterTier, stricterTier } from '@/lib/utils/tiers'

// POST: Trigger GPO risk scan
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) return unauthorized()
    if (!hasRole((session.user as any).appRole as AppRole, 'analyst')) return forbidden()

    const orgId = session.user.orgId
    let violationsCreated = 0

    // Find the tiering_rule policy for creating violations
    const [tierPolicy] = await db
      .select({ id: policies.id })
      .from(policies)
      .where(and(eq(policies.orgId, orgId), eq(policies.type, 'tiering_rule')))
      .limit(1)

    if (!tierPolicy) {
      return NextResponse.json({ error: 'No tiering_rule policy found. Create one first.' }, { status: 400 })
    }

    // 1. Find GPOs linked to control-plane OUs (Tier 0, or Top Tier which can take over Tier 0)
    const controlPlaneLinks = await db
      .select({
        gpoId: gpoLinks.gpoId,
        linkedOu: gpoLinks.linkedOu,
        ouTier: gpoLinks.adTierOfOu,
      })
      .from(gpoLinks)
      .where(and(
        eq(gpoLinks.orgId, orgId),
        inArray(gpoLinks.adTierOfOu, ['tier_0', 'tier_top'])
      ))

    // Strictest OU tier each GPO is linked to
    const gpoOuTier = new Map<string, string>()
    for (const l of controlPlaneLinks) {
      const prev = gpoOuTier.get(l.gpoId)
      gpoOuTier.set(l.gpoId, prev ? stricterTier(prev, l.ouTier) : l.ouTier)
    }
    const t0GpoIds = new Set([...gpoOuTier].filter(([, t]) => t === 'tier_0').map(([id]) => id))
    const controlPlaneGpoIds = new Set(gpoOuTier.keys())

    // 2. Check permissions on control-plane-linked GPOs held by identities below the OU's tier
    if (controlPlaneGpoIds.size > 0) {
      const candidatePerms = await db
        .select({
          gpoId: gpoPermissions.gpoId,
          trusteeIdentityId: gpoPermissions.trusteeIdentityId,
          trusteeName: gpoPermissions.trusteeName,
          permissionType: gpoPermissions.permissionType,
          identityTier: identities.adTier,
          identityId: identities.id,
        })
        .from(gpoPermissions)
        .innerJoin(identities, eq(gpoPermissions.trusteeIdentityId, identities.id))
        .where(and(
          eq(gpoPermissions.orgId, orgId),
          sql`${gpoPermissions.permissionType} IN ('edit_settings', 'modify_security', 'full_control', 'link_gpo')`,
          sql`${identities.adTier} != 'tier_0'`,
          sql`${gpoPermissions.gpoId} IN (${sql.join(Array.from(controlPlaneGpoIds).map(id => sql`${id}`), sql`,`)})`
        ))
      const dangerousPerms = candidatePerms.filter(p => isStricterTier(gpoOuTier.get(p.gpoId), p.identityTier))

      // Create policy violations for each finding
      for (const perm of dangerousPerms) {
        // Check if violation already exists
        const [existing] = await db
          .select({ id: policyViolations.id })
          .from(policyViolations)
          .where(and(
            eq(policyViolations.orgId, orgId),
            eq(policyViolations.identityId, perm.identityId),
            eq(policyViolations.violationType, 'tier_breach'),
            eq(policyViolations.status, 'open')
          ))
          .limit(1)

        if (!existing) {
          await db.insert(policyViolations).values({
            policyId: tierPolicy.id,
            identityId: perm.identityId,
            violationType: 'tier_breach',
            severity: 'critical',
            status: 'open',
            orgId,
          })
          violationsCreated++
        }
      }

      // Mark dangerous permissions
      for (const gpoId of controlPlaneGpoIds) {
        await db
          .update(gpoPermissions)
          .set({ dangerous: true })
          .where(and(
            eq(gpoPermissions.gpoId, gpoId),
            eq(gpoPermissions.orgId, orgId),
            sql`${gpoPermissions.permissionType} IN ('edit_settings', 'modify_security', 'full_control', 'link_gpo')`
          ))
      }
    }

    // 3. Flag all GPOs with edit permissions from T2 identities
    const t2EditPerms = await db
      .select({
        gpoPermissionId: gpoPermissions.id,
      })
      .from(gpoPermissions)
      .innerJoin(identities, eq(gpoPermissions.trusteeIdentityId, identities.id))
      .where(and(
        eq(gpoPermissions.orgId, orgId),
        sql`${gpoPermissions.permissionType} IN ('edit_settings', 'modify_security', 'full_control')`,
        eq(identities.adTier, 'tier_2')
      ))

    for (const perm of t2EditPerms) {
      await db
        .update(gpoPermissions)
        .set({ dangerous: true })
        .where(eq(gpoPermissions.id, perm.gpoPermissionId))
    }

    await logAction({
      actionType: 'run_scan',
      actorIdentityId: session.user.id,
      orgId,
      rationale: `GPO risk scan completed: ${violationsCreated} new violations created`,
      payload: { scan: 'gpo_risk', violationsCreated, t0GpoCount: t0GpoIds.size, topTierGpoCount: controlPlaneGpoIds.size - t0GpoIds.size, t2EditPermissionsFlagged: t2EditPerms.length },
    })

    return NextResponse.json({
      message: 'GPO scan complete',
      violationsCreated,
      t0GposScanned: t0GpoIds.size,
      topTierGposScanned: controlPlaneGpoIds.size - t0GpoIds.size,
    })
  } catch (error) {
    console.error('[GPO Scan] POST error:', error)
    return NextResponse.json({ error: 'GPO scan failed' }, { status: 500 })
  }
}
