/**
 * Reclassify an existing demo database for the Top Tier (Tier 0 adjacent) model —
 * the same classification seed/index.ts now generates — for the organization of
 * SEED_ADMIN_EMAIL (default admin@acmefs.sa). Safe to run more than once.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/apply-top-tier-demo.ts
 *
 * What it changes:
 *   - adds 'tier_top' to the ad_tier enum if missing (outside any transaction)
 *   - resources, GPOs (+ their links and permissions), groups → tier_top by name
 *   - 6 human admins → tier_top: EMP-0006..EMP-0011 (the seed's Top Tier range),
 *     topped up from the first tier_1 humans by display name if those are missing
 *   - service accounts SVC-0006 / SVC-0007 → svc-backup / svc-adconnect, tier_top
 *   - entitlements on Top Tier resources or with a Top Tier permission name → tier_top
 *   - recomputes identities.effective_tier / tier_violation from entitlements
 *     (same rule as the tier-scanner cron) and the entitlement tier_violation tag
 *   - adds the Top Tier GPO hardening baseline
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  users, identities, accounts, resources, groups, entitlements,
  gpoObjects, gpoLinks, gpoPermissions, gpoBaselines, peerAnomalies, attackPaths,
} from '@/lib/db/schema'
import { isStricterTier, stricterTier, type AdTier } from '@/lib/utils/tiers'

// ── Keep in sync with seed/index.ts ──

/** Top Tier resource → the permission name its entitlements carry. */
const TOP_TIER_RESOURCES: Record<string, string> = {
  'SRV-ADFS-01': 'ADFS Administrator',
  'SRV-AADConnect': 'Entra Connect Admin',
  'SRV-PKI-01': 'PKI Administrator',
  'SRV-BACKUP-01': 'Backup Operator',
  'CyberArk-PAM': 'PAM Vault Admin',
  'AZ-KEYVAULT-01': 'Key Vault Admin',
}
const TOP_TIER_PERMISSIONS = new Set([
  'ADFS Administrator', 'PKI Administrator', 'Entra Connect Admin',
  'Backup Operator', 'PAM Vault Admin', 'Key Vault Admin',
])
const TOP_TIER_GROUPS = ['Backup Operators', 'AZ-KeyVault-Admins']
const TOP_TIER_GPOS = ['PKI Certificate Autoenrollment', 'AD Connect Sync Policy', 'ADFS Server Baseline']
const TOP_TIER_HUMAN_SOURCE_IDS = ['EMP-0006', 'EMP-0007', 'EMP-0008', 'EMP-0009', 'EMP-0010', 'EMP-0011']
const TOP_TIER_HUMAN_COUNT = TOP_TIER_HUMAN_SOURCE_IDS.length
const TOP_TIER_SVC: Record<string, string> = { 'SVC-0006': 'svc-backup', 'SVC-0007': 'svc-adconnect' }
const TOP_TIER_BASELINE = {
  name: 'Top Tier Hardening Baseline', scope: 'Top Tier OU',
  settings: { MinimumPasswordLength: '15', LmCompatibilityLevel: '5', LSAProtection: 'Enabled', SMBSigningRequired: 'Enabled' },
}

/** Base resource name: the seed suffixes duplicates as `${name}-${index}`. */
function topTierResourceBase(name: string): string | undefined {
  if (TOP_TIER_RESOURCES[name]) return name
  return Object.keys(TOP_TIER_RESOURCES).find(base => name.startsWith(`${base}-`) && /^\d+$/.test(name.slice(base.length + 1)))
}

/** Edit-capable permission on a GPO held by a less privileged trustee. */
function isDangerousGpoPermission(permissionType: string, gpoTier: string, trusteeTier: string | null | undefined): boolean {
  if (permissionType === 'read' || permissionType === 'apply') return false
  return isStricterTier(gpoTier, trusteeTier)
}

async function main() {
  // Must run outside a transaction: a new enum value cannot be used in the
  // transaction that adds it.
  const existing = await db.execute(sql`SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ad_tier' AND e.enumlabel = 'tier_top'`)
  if (existing.length === 0) {
    await db.execute(sql.raw(`ALTER TYPE ad_tier ADD VALUE 'tier_top' BEFORE 'tier_1'`))
  }

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@acmefs.sa'
  const [user] = await db.select({ orgId: users.orgId }).from(users).where(eq(users.email, email)).limit(1)
  if (!user?.orgId) throw new Error(`No organization for ${email}`)
  const orgId = user.orgId

  const summary = await db.transaction(async (tx) => {
    const counts: Record<string, number> = {}
    const bump = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n }

    // ── Resources ──
    const orgResources = await tx.select({ id: resources.id, name: resources.name, adTier: resources.adTier, criticality: resources.criticality })
      .from(resources).where(eq(resources.orgId, orgId))
    const topResourceBase = new Map<string, string>() // resource id → base name
    for (const r of orgResources) {
      const base = topTierResourceBase(r.name)
      if (!base) continue
      topResourceBase.set(r.id, base)
      if (r.adTier !== 'tier_top' || r.criticality !== 'critical') {
        await tx.update(resources).set({ adTier: 'tier_top', criticality: 'critical' }).where(eq(resources.id, r.id))
        bump('resources')
      }
    }

    // ── GPOs, their links and permissions ──
    const topGpos = await tx.select({ id: gpoObjects.id, adTier: gpoObjects.adTier })
      .from(gpoObjects).where(and(eq(gpoObjects.orgId, orgId), inArray(gpoObjects.name, TOP_TIER_GPOS)))
    const topGpoIds = topGpos.map(g => g.id)
    for (const g of topGpos) {
      if (g.adTier !== 'tier_top') {
        await tx.update(gpoObjects).set({ adTier: 'tier_top', updatedAt: new Date() }).where(eq(gpoObjects.id, g.id))
        bump('gpos')
      }
    }
    if (topGpoIds.length > 0) {
      const links = await tx.select({ id: gpoLinks.id, linkedOu: gpoLinks.linkedOu, adTierOfOu: gpoLinks.adTierOfOu })
        .from(gpoLinks).where(and(eq(gpoLinks.orgId, orgId), inArray(gpoLinks.gpoId, topGpoIds)))
      for (const l of links) {
        // Only the GPO's own Tier 0 / Top Tier OU — a cross-tier link elsewhere keeps its OU tier
        if (!/,OU=(Tier 0|Top Tier),/i.test(l.linkedOu)) continue
        const linkedOu = l.linkedOu.replace(/,OU=Tier 0,/i, ',OU=Top Tier,')
        if (linkedOu !== l.linkedOu || l.adTierOfOu !== 'tier_top') {
          await tx.update(gpoLinks).set({ linkedOu, adTierOfOu: 'tier_top' }).where(eq(gpoLinks.id, l.id))
          bump('gpoLinks')
        }
      }
      const perms = await tx.update(gpoPermissions).set({ adTierOfGpo: 'tier_top' })
        .where(and(eq(gpoPermissions.orgId, orgId), inArray(gpoPermissions.gpoId, topGpoIds), sql`${gpoPermissions.adTierOfGpo} <> 'tier_top'`))
        .returning({ id: gpoPermissions.id })
      bump('gpoPermissionTiers', perms.length)
    }

    // ── Groups ──
    const changedGroups = await tx.update(groups).set({ adTier: 'tier_top' })
      .where(and(eq(groups.orgId, orgId), inArray(groups.name, TOP_TIER_GROUPS), sql`${groups.adTier} <> 'tier_top'`))
      .returning({ id: groups.id })
    bump('groups', changedGroups.length)

    // ── Identities ──
    const orgIdentities = await tx.select({
      id: identities.id, displayName: identities.displayName, type: identities.type, subType: identities.subType,
      adTier: identities.adTier, sourceId: identities.sourceId, samAccountName: identities.samAccountName,
    }).from(identities).where(eq(identities.orgId, orgId))

    const reclassified = new Set<string>()
    const humans = orgIdentities.filter(i => i.type === 'human')
    let need = TOP_TIER_HUMAN_COUNT - humans.filter(i => i.adTier === 'tier_top').length
    const humanPicks = humans
      .filter(i => i.adTier === 'tier_1' && TOP_TIER_HUMAN_SOURCE_IDS.includes(i.sourceId ?? ''))
      .sort((a, b) => (a.sourceId ?? '').localeCompare(b.sourceId ?? ''))
    const fallback = humans
      .filter(i => i.adTier === 'tier_1' && !humanPicks.includes(i))
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
    for (const h of [...humanPicks, ...fallback]) {
      if (need <= 0) break
      await tx.update(identities).set({ adTier: 'tier_top', updatedAt: new Date() }).where(eq(identities.id, h.id))
      reclassified.add(h.id)
      bump('humans')
      need--
    }

    for (const i of orgIdentities) {
      const svcName = TOP_TIER_SVC[i.sourceId ?? '']
      if (!svcName || i.type !== 'non_human' || i.subType !== 'service_account') continue
      if (i.adTier === 'tier_top' && i.displayName === svcName) continue
      await tx.update(identities).set({ adTier: 'tier_top', displayName: svcName, samAccountName: svcName, updatedAt: new Date() })
        .where(eq(identities.id, i.id))
      const oldNames = [i.samAccountName, i.displayName].filter((n): n is string => !!n)
      if (oldNames.length > 0) {
        await tx.update(accounts).set({ accountName: svcName })
          .where(and(eq(accounts.identityId, i.id), inArray(accounts.accountName, oldNames)))
      }
      if (i.adTier !== 'tier_top') reclassified.add(i.id)
      bump('serviceAccounts')
    }

    if (reclassified.size > 0) {
      const acc = await tx.update(accounts).set({ accountType: 'admin', privileged: true })
        .where(inArray(accounts.identityId, [...reclassified])).returning({ id: accounts.id })
      bump('accounts', acc.length)
    }

    // Current identity tiers after reclassification
    const identityTier = new Map<string, string>()
    for (const i of orgIdentities) identityTier.set(i.id, reclassified.has(i.id) ? 'tier_top' : i.adTier)

    // ── Entitlements ──
    const orgEntitlements = await tx.select({
      id: entitlements.id, identityId: entitlements.identityId, resourceId: entitlements.resourceId,
      permissionName: entitlements.permissionName, adTierOfPermission: entitlements.adTierOfPermission, riskTags: entitlements.riskTags,
    }).from(entitlements).where(eq(entitlements.orgId, orgId))

    for (const e of orgEntitlements) {
      const base = topResourceBase.get(e.resourceId)
      let tier: string = e.adTierOfPermission
      let permissionName = e.permissionName
      if ((base || TOP_TIER_PERMISSIONS.has(e.permissionName)) && isStricterTier('tier_top', tier)) {
        tier = 'tier_top'
        if (base && !TOP_TIER_PERMISSIONS.has(permissionName)) permissionName = TOP_TIER_RESOURCES[base]
      }
      const tierChanged = tier !== e.adTierOfPermission
      if (tierChanged) bump('entitlements')

      // tier_violation tag — only where this script moved the entitlement or its identity
      const tags = e.riskTags ?? []
      let riskTags = tags
      if (tierChanged || reclassified.has(e.identityId)) {
        const violation = isStricterTier(tier, identityTier.get(e.identityId))
        const has = tags.includes('tier_violation')
        if (violation && !has) riskTags = [...tags, 'tier_violation']
        if (!violation && has) riskTags = tags.filter(t => t !== 'tier_violation')
      }

      if (tierChanged || permissionName !== e.permissionName || riskTags !== tags) {
        await tx.update(entitlements)
          .set({ adTierOfPermission: tier as AdTier, permissionName, riskTags })
          .where(eq(entitlements.id, e.id))
        e.adTierOfPermission = tier as AdTier
      }
    }

    // ── Effective tier / tier violation (same rule as the tier-scanner cron) ──
    const reached = new Map<string, AdTier>()
    for (const e of orgEntitlements) {
      reached.set(e.identityId, stricterTier(reached.get(e.identityId) ?? 'unclassified', e.adTierOfPermission))
    }
    const current = await tx.select({ id: identities.id, adTier: identities.adTier, effectiveTier: identities.effectiveTier, tierViolation: identities.tierViolation })
      .from(identities).where(eq(identities.orgId, orgId))
    let violationsBefore = 0
    let violationsAfter = 0
    for (const i of current) {
      const effectiveTier = reached.get(i.id) ?? 'unclassified'
      const tierViolation = isStricterTier(effectiveTier, i.adTier)
      if (i.tierViolation) violationsBefore++
      if (tierViolation) violationsAfter++
      if (i.effectiveTier !== effectiveTier || i.tierViolation !== tierViolation) {
        await tx.update(identities).set({ effectiveTier, tierViolation, updatedAt: new Date() }).where(eq(identities.id, i.id))
        bump('effectiveTierUpdates')
      }
    }
    counts.violationsBefore = violationsBefore
    counts.violationsAfter = violationsAfter

    // ── GPO permission danger flags where the GPO or trustee changed tier ──
    const groupTier = new Map((await tx.select({ id: groups.id, adTier: groups.adTier }).from(groups).where(eq(groups.orgId, orgId))).map(g => [g.id, g.adTier as string]))
    const changedGroupIds = new Set(changedGroups.map(g => g.id))
    const orgPerms = await tx.select({
      id: gpoPermissions.id, gpoId: gpoPermissions.gpoId, permissionType: gpoPermissions.permissionType, dangerous: gpoPermissions.dangerous,
      adTierOfGpo: gpoPermissions.adTierOfGpo, trusteeIdentityId: gpoPermissions.trusteeIdentityId, trusteeGroupId: gpoPermissions.trusteeGroupId,
    }).from(gpoPermissions).where(eq(gpoPermissions.orgId, orgId))
    for (const p of orgPerms) {
      const touched = topGpoIds.includes(p.gpoId)
        || (!!p.trusteeIdentityId && reclassified.has(p.trusteeIdentityId))
        || (!!p.trusteeGroupId && changedGroupIds.has(p.trusteeGroupId))
      if (!touched) continue
      const trusteeTier = p.trusteeIdentityId ? identityTier.get(p.trusteeIdentityId) : p.trusteeGroupId ? groupTier.get(p.trusteeGroupId) : undefined
      if (!trusteeTier) continue
      const dangerous = isDangerousGpoPermission(p.permissionType, p.adTierOfGpo, trusteeTier)
      if (dangerous !== p.dangerous) {
        await tx.update(gpoPermissions).set({ dangerous }).where(eq(gpoPermissions.id, p.id))
        bump('gpoPermissionDangerFlags')
      }
    }

    // ── Top Tier GPO baseline ──
    const [baseline] = await tx.select({ id: gpoBaselines.id }).from(gpoBaselines)
      .where(and(eq(gpoBaselines.orgId, orgId), eq(gpoBaselines.name, TOP_TIER_BASELINE.name))).limit(1)
    if (!baseline) {
      await tx.insert(gpoBaselines).values({ ...TOP_TIER_BASELINE, adTier: 'tier_top', orgId })
      bump('baselines')
    }

    // ── Denormalised tiers in JSON: peer anomalies and attack path nodes ──
    const anomalies = await tx.select({ id: peerAnomalies.id, excess: peerAnomalies.excessEntitlements, unique: peerAnomalies.uniqueEntitlements })
      .from(peerAnomalies).where(eq(peerAnomalies.orgId, orgId))
    const retierPerms = (list: unknown) => {
      if (!Array.isArray(list)) return { list, changed: false }
      let changed = false
      const out = list.map((x: any) => {
        if (x && TOP_TIER_PERMISSIONS.has(x.permissionName) && isStricterTier('tier_top', x.tier)) { changed = true; return { ...x, tier: 'tier_top' } }
        return x
      })
      return { list: out, changed }
    }
    for (const a of anomalies) {
      const ex = retierPerms(a.excess)
      const un = retierPerms(a.unique)
      if (ex.changed || un.changed) {
        await tx.update(peerAnomalies).set({ excessEntitlements: ex.list, uniqueEntitlements: un.list }).where(eq(peerAnomalies.id, a.id))
        bump('peerAnomalies')
      }
    }

    const nodeTier = new Map<string, string>()
    for (const id of reclassified) nodeTier.set(id, 'tier_top')
    for (const id of topResourceBase.keys()) nodeTier.set(id, 'tier_top')
    for (const id of changedGroupIds) nodeTier.set(id, 'tier_top')
    const paths = await tx.select({ id: attackPaths.id, nodes: attackPaths.pathNodes }).from(attackPaths).where(eq(attackPaths.orgId, orgId))
    for (const p of paths) {
      if (!Array.isArray(p.nodes)) continue
      let changed = false
      const nodes = (p.nodes as any[]).map(n => {
        const tier = n && nodeTier.get(n.id)
        if (tier && n.tier !== tier) { changed = true; return { ...n, tier } }
        return n
      })
      if (changed) {
        await tx.update(attackPaths).set({ pathNodes: nodes }).where(eq(attackPaths.id, p.id))
        bump('attackPaths')
      }
    }

    return counts
  })

  console.log(`Top Tier applied to org ${orgId} (${email})`)
  const labels: [string, string][] = [
    ['resources', 'Resources → tier_top'],
    ['gpos', 'GPOs → tier_top'],
    ['gpoLinks', 'GPO links → Top Tier OU'],
    ['gpoPermissionTiers', 'GPO permissions → tier_top GPO'],
    ['gpoPermissionDangerFlags', 'GPO permission danger flags updated'],
    ['groups', 'Groups → tier_top'],
    ['humans', 'Human admins → tier_top'],
    ['serviceAccounts', 'Service accounts → tier_top'],
    ['accounts', 'Accounts → admin/privileged'],
    ['entitlements', 'Entitlements → tier_top'],
    ['effectiveTierUpdates', 'Identities with effective tier / violation updated'],
    ['baselines', 'GPO baselines added'],
    ['peerAnomalies', 'Peer anomalies updated'],
    ['attackPaths', 'Attack paths updated'],
  ]
  for (const [key, label] of labels) console.log(`  ${label}: ${summary[key] ?? 0}`)
  console.log(`  Tier violations: ${summary.violationsBefore} → ${summary.violationsAfter}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
