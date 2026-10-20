/**
 * Staleness rules for the sync-health cron (`/api/cron/sync-health`).
 *
 * A source is flagged only when it is expected to sync on a schedule and has
 * missed it. Sources that are disconnected, already in error, manual (CSV,
 * frequency 0) or have no stored connector config (nothing could ever sync
 * them) are left alone, so the job never overwrites a specific failure reason
 * and never flags a source it cannot judge.
 */

/** Missed intervals before a connected source is considered stale. */
export const STALE_INTERVALS = 2

export interface SyncHealthSource {
  syncStatus: 'connected' | 'syncing' | 'error' | 'disconnected'
  lastSyncAt: Date | null
  syncFrequencyMinutes: number
  /** Stored connector config: encrypted string, legacy plaintext object, or empty. */
  config: unknown
}

export function hasStoredConfig(config: unknown): boolean {
  if (typeof config === 'string') return config.length > 0
  return !!config && typeof config === 'object' && Object.keys(config).length > 0
}

/**
 * Returns a concrete, credential-free reason when the source should be marked
 * as error, or null when it is healthy or out of scope for this check.
 */
export function staleSyncReason(source: SyncHealthSource, now: Date = new Date()): string | null {
  if (source.syncStatus !== 'connected' && source.syncStatus !== 'syncing') return null
  if (!(source.syncFrequencyMinutes > 0)) return null
  if (!hasStoredConfig(source.config)) return null

  const intervalMs = source.syncFrequencyMinutes * 60_000
  if (!source.lastSyncAt) {
    return `No successful sync recorded (expected every ${source.syncFrequencyMinutes} min)`
  }
  const elapsedMs = now.getTime() - source.lastSyncAt.getTime()
  if (elapsedMs <= intervalMs * STALE_INTERVALS) return null

  const missed = Math.floor(elapsedMs / intervalMs)
  return `No successful sync in ${missed} intervals of ${source.syncFrequencyMinutes} min (last: ${source.lastSyncAt.toISOString()})`
}
