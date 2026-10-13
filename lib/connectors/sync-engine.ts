// Sync Engine
// Orchestrates the full sync lifecycle for an integration source:
//   1. Validate connection
//   2. Extract identities, groups, and entitlements from the source
//   3. Transform and upsert into the database
//   4. Reconcile deletions (mark removed items)
//   5. Log sync metadata
//
// This module is used by both manual sync triggers (API routes) and
// scheduled cron jobs (Cloudflare Workers / Next.js cron).

import { db } from '@/lib/db'
import { identities } from '@/lib/db/schema/identities'
import { groups } from '@/lib/db/schema/groups'
import { groupMemberships } from '@/lib/db/schema/groups'
import { entitlements } from '@/lib/db/schema/entitlements'
import { resources } from '@/lib/db/schema/resources'
import { integrationSources } from '@/lib/db/schema/integrations'
import { eq, and, notInArray } from 'drizzle-orm'
import { scoreIdentityQuality } from '@/lib/data-quality/scorer'
import type {
  Connector,
  ConnectorConfig,
  SyncResult,
  RawIdentity,
  RawGroup,
  RawEntitlement,
  SyncProgress,
  SyncProgressCallback,
} from './base'
import { createConnectorAsync } from './factory'
import { summarizeSyncError, summarizeRecordErrors } from './sync-error'
import { isControlPlaneTier } from '@/lib/utils/tiers'

// ---------- Public types ----------

export interface SyncOptions {
  /** Organization ID to sync data into. */
  orgId: string
  /** The integration source ID (from the integrationSources table). */
  integrationId: string
  /** Connector configuration with type and credentials. */
  config: ConnectorConfig
  /** Optional progress callback for real-time UI updates. */
  onProgress?: SyncProgressCallback
  /** If true, skip the reconcile (deletion detection) phase. */
  skipReconcile?: boolean
  /** If true, perform a dry run (extract only, no DB writes). */
  dryRun?: boolean
}

export interface SyncReport extends SyncResult {
  integrationId: string
  sourceType: string
  startedAt: Date
  completedAt: Date
  phases: SyncPhaseReport[]
}

export interface SyncPhaseReport {
  phase: string
  count: number
  durationMs: number
  errors: string[]
}

// ---------- Sync Engine ----------

/**
 * Execute a full sync for the given integration source.
 * Returns a detailed report of what was synced.
 */
export async function executeSync(options: SyncOptions): Promise<SyncReport> {
  const { orgId, integrationId, config, onProgress, skipReconcile, dryRun } = options
  const startedAt = new Date()
  const phases: SyncPhaseReport[] = []
  const allErrors: string[] = []
  let identitiesUpserted = 0
  let accountsUpserted = 0
  let groupsUpserted = 0
  let entitlementsUpserted = 0

  const notify = (progress: SyncProgress) => {
    onProgress?.(progress)
  }

  // Mark integration as syncing
  if (!dryRun) {
    await updateIntegrationStatus(integrationId, 'syncing')
  }

  try {
    // 1. Create connector and test connection
    notify({ phase: 'connect', current: 0, total: 1, message: 'Connecting to source...' })
    const connector = await createConnectorAsync(config)
    const connectionTest = await connector.testConnection()
    if (!connectionTest.ok) {
      throw new Error(`Connection test failed: ${connectionTest.message}`)
    }
    notify({ phase: 'connect', current: 1, total: 1, message: connectionTest.message })

    // 2. Extract identities
    notify({ phase: 'extractIdentities', current: 0, total: 0, message: 'Extracting identities...' })
    const phaseIdentities = await timedPhase('extractIdentities', async () => {
      return connector.extractIdentities(notify)
    })
    phases.push(phaseIdentities.report)

    // 3. Extract groups
    notify({ phase: 'extractGroups', current: 0, total: 0, message: 'Extracting groups...' })
    const phaseGroups = await timedPhase('extractGroups', async () => {
      return connector.extractGroups(notify)
    })
    phases.push(phaseGroups.report)

    // 4. Extract entitlements (if connector supports it)
    let rawEntitlements: RawEntitlement[] = []
    if (connector.extractEntitlements) {
      notify({ phase: 'extractEntitlements', current: 0, total: 0, message: 'Extracting entitlements...' })
      const phaseEntitlements = await timedPhase('extractEntitlements', async () => {
        return connector.extractEntitlements!(notify)
      })
      rawEntitlements = phaseEntitlements.result
      phases.push(phaseEntitlements.report)
    }

    if (dryRun) {
      return {
        integrationId,
        sourceType: config.type,
        identitiesUpserted: phaseIdentities.result.length,
        accountsUpserted: 0,
        groupsUpserted: phaseGroups.result.length,
        entitlementsUpserted: rawEntitlements.length,
        errors: [],
        duration: Date.now() - startedAt.getTime(),
        startedAt,
        completedAt: new Date(),
        phases,
      }
    }

    // 5. Upsert identities into database
    notify({ phase: 'upsertIdentities', current: 0, total: phaseIdentities.result.length, message: 'Saving identities...' })
    const upsertIdResult = await upsertIdentities(orgId, config.type, phaseIdentities.result, notify)
    identitiesUpserted = upsertIdResult.count
    allErrors.push(...upsertIdResult.errors)
    phases.push({
      phase: 'upsertIdentities',
      count: identitiesUpserted,
      durationMs: upsertIdResult.durationMs,
      errors: upsertIdResult.errors,
    })

    // 5b. Quality scoring pass for upserted identities
    notify({ phase: 'qualityScoring', current: 0, total: identitiesUpserted, message: 'Scoring data quality...' })
    const qualityScoringStart = Date.now()
    const upsertedIdentities = await db
      .select()
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.sourceSystem, config.type as any),
      ))
    for (let qi = 0; qi < upsertedIdentities.length; qi++) {
      const identity = upsertedIdentities[qi]
      const quality = scoreIdentityQuality(identity)
      await db.update(identities)
        .set({ dataQuality: quality })
        .where(eq(identities.id, identity.id))
      if (onProgress && qi % 50 === 0) {
        notify({ phase: 'qualityScoring', current: qi, total: upsertedIdentities.length, message: `Scored ${qi}/${upsertedIdentities.length} identities` })
      }
    }
    notify({ phase: 'qualityScoring', current: upsertedIdentities.length, total: upsertedIdentities.length, message: `Quality scoring complete` })
    phases.push({
      phase: 'qualityScoring',
      count: upsertedIdentities.length,
      durationMs: Date.now() - qualityScoringStart,
      errors: [],
    })

    // 6. Upsert groups into database
    notify({ phase: 'upsertGroups', current: 0, total: phaseGroups.result.length, message: 'Saving groups...' })
    const upsertGrpResult = await upsertGroups(orgId, config.type, phaseGroups.result, notify)
    groupsUpserted = upsertGrpResult.count
    allErrors.push(...upsertGrpResult.errors)
    phases.push({
      phase: 'upsertGroups',
      count: groupsUpserted,
      durationMs: upsertGrpResult.durationMs,
      errors: upsertGrpResult.errors,
    })

    // 7. Upsert entitlements into database
    if (rawEntitlements.length > 0) {
      notify({ phase: 'upsertEntitlements', current: 0, total: rawEntitlements.length, message: 'Saving entitlements...' })
      const upsertEntResult = await upsertEntitlements(orgId, rawEntitlements, notify)
      entitlementsUpserted = upsertEntResult.count
      allErrors.push(...upsertEntResult.errors)
      phases.push({
        phase: 'upsertEntitlements',
        count: entitlementsUpserted,
        durationMs: upsertEntResult.durationMs,
        errors: upsertEntResult.errors,
      })
    }

    // 8. Reconcile removals (detect identities that disappeared from source)
    if (!skipReconcile) {
      notify({ phase: 'reconcile', current: 0, total: 0, message: 'Reconciling deletions...' })
      const sourceIds = phaseIdentities.result.map(i => i.sourceId)
      const reconcileResult = await reconcileIdentities(orgId, config.type, sourceIds)
      phases.push({
        phase: 'reconcile',
        count: reconcileResult.markedCount,
        durationMs: reconcileResult.durationMs,
        errors: [],
      })
    }

    // 9. Update integration source metadata
    const totalRecords = identitiesUpserted + groupsUpserted + entitlementsUpserted
    // Record-level failures (or a failed extraction phase) keep the sync
    // "connected" but leave a short note; a clean run clears the last error.
    // (upsert errors are already in allErrors; extraction failures only live in the phase reports)
    const phaseErrors = phases
      .filter(p => p.phase.startsWith('extract'))
      .flatMap(p => p.errors.map(e => `${p.phase}: ${e}`))
    await updateIntegrationStatus(integrationId, 'connected', totalRecords, summarizeRecordErrors([...phaseErrors, ...allErrors]))

    const completedAt = new Date()
    notify({
      phase: 'complete',
      current: totalRecords,
      total: totalRecords,
      message: `Sync complete: ${identitiesUpserted} identities, ${groupsUpserted} groups, ${entitlementsUpserted} entitlements`,
    })

    return {
      integrationId,
      sourceType: config.type,
      identitiesUpserted,
      accountsUpserted,
      groupsUpserted,
      entitlementsUpserted,
      errors: allErrors,
      duration: completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
      phases,
    }
  } catch (e: any) {
    // Mark integration as errored
    if (!dryRun) {
      await updateIntegrationStatus(integrationId, 'error', undefined, summarizeSyncError(e)).catch(() => {})
    }
    throw new Error(`Sync failed for ${config.type}: ${e.message}`)
  }
}

// ---------- Database operations ----------

async function upsertIdentities(
  orgId: string,
  sourceSystem: string,
  rawIdentities: RawIdentity[],
  onProgress?: SyncProgressCallback,
): Promise<{ count: number; errors: string[]; durationMs: number }> {
  const start = Date.now()
  const errors: string[] = []
  let count = 0

  for (let i = 0; i < rawIdentities.length; i++) {
    const raw = rawIdentities[i]
    try {
      const existing = await db
        .select({ id: identities.id })
        .from(identities)
        .where(
          and(
            eq(identities.orgId, orgId),
            eq(identities.sourceId, raw.sourceId),
            eq(identities.sourceSystem, sourceSystem as any),
          ),
        )
        .limit(1)

      const data = {
        displayName: raw.displayName,
        type: raw.type as any,
        subType: raw.subType as any,
        status: raw.status as any,
        adTier: raw.adTier as any,
        sourceSystem: sourceSystem as any,
        sourceId: raw.sourceId,
        upn: raw.upn || null,
        samAccountName: raw.samAccountName || null,
        email: raw.email || null,
        department: raw.department || null,
        lastLogonAt: raw.lastLogonAt || null,
        passwordLastSetAt: raw.passwordLastSetAt || null,
        adSecurity: raw.adSecurity ?? null,
        orgId,
        updatedAt: new Date(),
      }

      if (existing.length > 0) {
        await db.update(identities).set(data).where(eq(identities.id, existing[0].id))
      } else {
        await db.insert(identities).values({ ...data, createdInSourceAt: new Date() })
      }
      count++
    } catch (e: any) {
      errors.push(`Identity ${raw.displayName}: ${e.message}`)
    }

    if (onProgress && i % 50 === 0) {
      onProgress({
        phase: 'upsertIdentities',
        current: i,
        total: rawIdentities.length,
        message: `Saved ${i}/${rawIdentities.length} identities`,
      })
    }
  }

  return { count, errors, durationMs: Date.now() - start }
}

async function upsertGroups(
  orgId: string,
  sourceSystem: string,
  rawGroups: RawGroup[],
  onProgress?: SyncProgressCallback,
): Promise<{ count: number; errors: string[]; durationMs: number }> {
  const start = Date.now()
  const errors: string[] = []
  let count = 0

  for (let i = 0; i < rawGroups.length; i++) {
    const raw = rawGroups[i]
    try {
      const existing = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.orgId, orgId), eq(groups.sourceId, raw.sourceId)))
        .limit(1)

      const data = {
        name: raw.name,
        type: raw.type as any,
        scope: (raw.scope || 'global') as any,
        adTier: raw.adTier as any,
        sourceSystem: sourceSystem as any,
        sourceId: raw.sourceId,
        memberCount: raw.members.length,
        nestedGroupCount: 0,
        isPrivileged: raw.isPrivileged,
        orgId,
      }

      if (existing.length > 0) {
        await db.update(groups).set(data).where(eq(groups.id, existing[0].id))
      } else {
        await db.insert(groups).values(data)
      }
      count++
    } catch (e: any) {
      errors.push(`Group ${raw.name}: ${e.message}`)
    }

    if (onProgress && i % 50 === 0) {
      onProgress({
        phase: 'upsertGroups',
        current: i,
        total: rawGroups.length,
        message: `Saved ${i}/${rawGroups.length} groups`,
      })
    }
  }

  return { count, errors, durationMs: Date.now() - start }
}

/**
 * Get or create a placeholder resource for entitlements that don't have an
 * explicit resource mapping. The entitlements table requires a resourceId (NOT NULL),
 * so we create a "Synced Entitlement" resource per application/scope.
 */
async function getOrCreateResource(
  orgId: string,
  applicationName: string,
  adTier: string,
): Promise<string> {
  const resourceName = applicationName || 'Synced Source'

  const existing = await db
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(
        eq(resources.orgId, orgId),
        eq(resources.name, resourceName),
      ),
    )
    .limit(1)

  if (existing.length > 0) return existing[0].id

  const inserted = await db
    .insert(resources)
    .values({
      name: resourceName,
      type: 'saas_app' as any,
      adTier: adTier as any,
      criticality: isControlPlaneTier(adTier) ? 'critical' as any : adTier === 'tier_1' ? 'high' as any : 'medium' as any,
      environment: 'production' as any,
      orgId,
    })
    .returning({ id: resources.id })

  return inserted[0].id
}

async function upsertEntitlements(
  orgId: string,
  rawEntitlements: RawEntitlement[],
  onProgress?: SyncProgressCallback,
): Promise<{ count: number; errors: string[]; durationMs: number }> {
  const start = Date.now()
  const errors: string[] = []
  let count = 0

  // Cache resource IDs by application name to avoid repeated lookups
  const resourceCache = new Map<string, string>()

  for (let i = 0; i < rawEntitlements.length; i++) {
    const raw = rawEntitlements[i]
    try {
      // Find the identity by sourceId to get the DB identity ID
      const identity = await db
        .select({ id: identities.id })
        .from(identities)
        .where(
          and(
            eq(identities.orgId, orgId),
            eq(identities.sourceId, raw.identitySourceId),
          ),
        )
        .limit(1)

      if (identity.length === 0) {
        errors.push(`Entitlement ${raw.permissionName}: identity ${raw.identitySourceId} not found`)
        continue
      }

      // Get or create a resource for this entitlement
      const resourceKey = raw.application || raw.permissionScope || 'Unknown Source'
      let resourceId = resourceCache.get(resourceKey)
      if (!resourceId) {
        resourceId = await getOrCreateResource(orgId, resourceKey, raw.adTierOfPermission)
        resourceCache.set(resourceKey, resourceId)
      }

      // Check for existing entitlement
      const existingEnt = await db
        .select({ id: entitlements.id })
        .from(entitlements)
        .where(
          and(
            eq(entitlements.orgId, orgId),
            eq(entitlements.identityId, identity[0].id),
            eq(entitlements.permissionName, raw.permissionName),
          ),
        )
        .limit(1)

      const data = {
        identityId: identity[0].id,
        resourceId,
        permissionType: raw.permissionType as any,
        permissionName: raw.permissionName,
        permissionScope: raw.permissionScope || null,
        adTierOfPermission: raw.adTierOfPermission as any,
        grantedAt: raw.grantedAt || new Date(),
        grantedBy: raw.grantedBy || null,
        lastUsedAt: raw.lastUsedAt ?? null,
        certificationStatus: raw.certified ? 'certified' as const : 'pending' as const,
        lastCertifiedAt: raw.lastCertifiedAt ?? null,
        riskTags: raw.riskTags || [],
        orgId,
      }

      if (existingEnt.length > 0) {
        await db.update(entitlements).set(data).where(eq(entitlements.id, existingEnt[0].id))
      } else {
        await db.insert(entitlements).values({
          ...data,
          certifiable: true,
        })
      }
      count++
    } catch (e: any) {
      errors.push(`Entitlement ${raw.permissionName}: ${e.message}`)
    }

    if (onProgress && i % 50 === 0) {
      onProgress({
        phase: 'upsertEntitlements',
        current: i,
        total: rawEntitlements.length,
        message: `Saved ${i}/${rawEntitlements.length} entitlements`,
      })
    }
  }

  return { count, errors, durationMs: Date.now() - start }
}

/**
 * Reconcile: mark identities that are present in the DB but missing from the
 * latest source extract as 'inactive'. This detects deletions in the source.
 */
async function reconcileIdentities(
  orgId: string,
  sourceSystem: string,
  currentSourceIds: string[],
): Promise<{ markedCount: number; durationMs: number }> {
  const start = Date.now()

  if (currentSourceIds.length === 0) {
    return { markedCount: 0, durationMs: Date.now() - start }
  }

  // Mark identities not in the current extract as inactive
  const result = await db
    .update(identities)
    .set({ status: 'inactive' as any, updatedAt: new Date() })
    .where(
      and(
        eq(identities.orgId, orgId),
        eq(identities.sourceSystem, sourceSystem as any),
        eq(identities.status, 'active' as any),
        notInArray(identities.sourceId, currentSourceIds),
      ),
    )

  return {
    markedCount: 0, // Drizzle doesn't return affected row count from update by default
    durationMs: Date.now() - start,
  }
}

// ---------- Integration status helpers ----------

async function updateIntegrationStatus(
  integrationId: string,
  status: 'connected' | 'syncing' | 'error' | 'disconnected',
  recordCount?: number,
  /** Credential-free failure reason (see summarizeSyncError); cleared on success. */
  errorMessage?: string | null,
): Promise<void> {
  try {
    const updateData: Partial<typeof integrationSources.$inferInsert> = {
      syncStatus: status,
    }
    if (status === 'connected') {
      updateData.lastSyncAt = new Date()
      updateData.lastSyncError = errorMessage ?? null
    }
    if (status === 'error') {
      updateData.lastSyncError = errorMessage || 'Unknown error'
    }
    if (recordCount !== undefined) {
      updateData.lastSyncRecordCount = recordCount
    }
    await db
      .update(integrationSources)
      .set(updateData)
      .where(eq(integrationSources.id, integrationId))
  } catch (e: any) {
    console.error(`Failed to update integration status: ${e.message}`)
  }
}

// ---------- Helpers ----------

async function timedPhase<T>(
  phaseName: string,
  fn: () => Promise<T[]>,
): Promise<{ result: T[]; report: SyncPhaseReport }> {
  const start = Date.now()
  try {
    const result = await fn()
    return {
      result,
      report: {
        phase: phaseName,
        count: result.length,
        durationMs: Date.now() - start,
        errors: [],
      },
    }
  } catch (e: any) {
    return {
      result: [],
      report: {
        phase: phaseName,
        count: 0,
        durationMs: Date.now() - start,
        errors: [e.message],
      },
    }
  }
}
