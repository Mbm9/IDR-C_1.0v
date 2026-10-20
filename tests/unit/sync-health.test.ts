import { describe, it, expect } from 'vitest'
import { staleSyncReason, hasStoredConfig } from '@/lib/connectors/sync-health'

const now = new Date('2026-10-20T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)
const base = {
  syncStatus: 'connected' as const,
  lastSyncAt: hoursAgo(1),
  syncFrequencyMinutes: 60,
  config: 'enc:v1:abcdef',
}

describe('staleSyncReason', () => {
  it('is null for a recently synced source', () => {
    expect(staleSyncReason(base, now)).toBeNull()
    expect(staleSyncReason({ ...base, lastSyncAt: hoursAgo(2) }, now)).toBeNull()
  })

  it('gives a concrete reason with the last sync time when stale', () => {
    const reason = staleSyncReason({ ...base, lastSyncAt: hoursAgo(5) }, now)
    expect(reason).toBe('No successful sync in 5 intervals of 60 min (last: 2026-10-20T07:00:00.000Z)')
  })

  it('flags a scheduled source that never synced, with a reason', () => {
    expect(staleSyncReason({ ...base, lastSyncAt: null }, now)).toMatch(/No successful sync recorded/)
  })

  it('never touches disconnected or already-errored sources', () => {
    expect(staleSyncReason({ ...base, syncStatus: 'disconnected', lastSyncAt: null }, now)).toBeNull()
    expect(staleSyncReason({ ...base, syncStatus: 'error', lastSyncAt: hoursAgo(48) }, now)).toBeNull()
  })

  it('skips manual sources and sources without stored config', () => {
    expect(staleSyncReason({ ...base, syncFrequencyMinutes: 0, lastSyncAt: hoursAgo(48) }, now)).toBeNull()
    expect(staleSyncReason({ ...base, config: {}, lastSyncAt: hoursAgo(48) }, now)).toBeNull()
  })
})

describe('hasStoredConfig', () => {
  it('detects encrypted strings and non-empty legacy objects', () => {
    expect(hasStoredConfig('enc')).toBe(true)
    expect(hasStoredConfig({ url: 'x' })).toBe(true)
    expect(hasStoredConfig('')).toBe(false)
    expect(hasStoredConfig({})).toBe(false)
    expect(hasStoredConfig(null)).toBe(false)
  })
})
