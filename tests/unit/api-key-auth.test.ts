import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'

// Rows the fake api_keys lookup returns, and update calls made on it.
let keyRows: Array<Record<string, any>> = []
const updates: Array<Record<string, any>> = []
let lookedUpPrefix: unknown

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: { prefix?: unknown }) => {
          lookedUpPrefix = cond?.prefix
          return { limit: () => Promise.resolve(keyRows.filter((r) => r.keyPrefix === cond?.prefix)) }
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, any>) => {
        updates.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
  },
}))
vi.mock('@/lib/db/schema', () => ({ apiKeys: { keyPrefix: 'keyPrefix', id: 'id' } }))
vi.mock('drizzle-orm', () => ({
  // eq(apiKeys.keyPrefix, value) → a marker the fake db can read
  eq: (col: string, value: unknown) => (col === 'keyPrefix' ? { prefix: value } : { id: value }),
}))

import { verifyApiKey, LAST_USED_THROTTLE_MS } from '@/lib/auth/api-key'
import { extractApiKey, isApiKeyPath, apiKeyPrefix } from '@/lib/auth/api-key-token'
import { rateLimitKey } from '@/lib/middleware/rate-limit'

const RAW_KEY = 'idr_' + 'a1b2c3d4'.repeat(8)
const OTHER_KEY = 'idr_' + 'a1b2c3d4' + 'f'.repeat(56) // same prefix, different secret

function request(authorization?: string) {
  const headers = new Headers()
  if (authorization) headers.set('authorization', authorization)
  return { headers }
}

async function keyRow(overrides: Record<string, any> = {}) {
  return {
    id: 'key-1',
    label: 'Splunk',
    keyPrefix: apiKeyPrefix(RAW_KEY),
    keyHash: await bcrypt.hash(RAW_KEY, 4),
    orgId: 'org-1',
    createdBy: 'user-1',
    revoked: false,
    expiresAt: null,
    lastUsedAt: null,
    ...overrides,
  }
}

describe('api key token helpers', () => {
  it('extracts a well-formed idr_ bearer token only', () => {
    expect(extractApiKey(request(`Bearer ${RAW_KEY}`).headers)).toBe(RAW_KEY)
    expect(extractApiKey(request(`bearer ${RAW_KEY}`).headers)).toBe(RAW_KEY)
    expect(extractApiKey(request().headers)).toBeNull()
    expect(extractApiKey(request('Bearer some-cron-secret').headers)).toBeNull()
    expect(extractApiKey(request('Bearer idr_short').headers)).toBeNull()
    expect(extractApiKey(request(`Basic ${RAW_KEY}`).headers)).toBeNull()
  })

  it('allow-lists only the machine endpoints', () => {
    expect(isApiKeyPath('/api/events/ingest')).toBe(true)
    expect(isApiKeyPath('/api/events/ingest/')).toBe(true)
    expect(isApiKeyPath('/api/identities')).toBe(false)
    expect(isApiKeyPath('/api/settings/api-keys')).toBe(false)
    expect(isApiKeyPath('/api/events/ingest/../../identities')).toBe(false)
  })

  it('rate-limits API-key traffic per key prefix', () => {
    const h = new Headers({ 'x-real-ip': '10.0.0.1' })
    expect(rateLimitKey('api', h, null, 'idr_a1b2c3d4')).toBe('apikey:idr_a1b2c3d4')
    expect(rateLimitKey('api', h, 'u-1', null)).toBe('user:u-1')
    expect(rateLimitKey('api', h)).toBe('ip:10.0.0.1')
  })
})

describe('verifyApiKey', () => {
  beforeEach(() => {
    keyRows = []
    updates.length = 0
    lookedUpPrefix = undefined
  })

  it('accepts a valid key, resolves the org and records last use', async () => {
    keyRows = [await keyRow()]
    const principal = await verifyApiKey(request(`Bearer ${RAW_KEY}`))
    expect(lookedUpPrefix).toBe('idr_a1b2c3d4')
    expect(principal).toMatchObject({ keyId: 'key-1', orgId: 'org-1', keyPrefix: 'idr_a1b2c3d4', appRole: 'analyst' })
    expect(updates).toHaveLength(1)
    expect(updates[0].lastUsedAt).toBeInstanceOf(Date)
  })

  it('throttles last_used_at updates', async () => {
    keyRows = [await keyRow({ lastUsedAt: new Date(Date.now() - LAST_USED_THROTTLE_MS / 2) })]
    expect(await verifyApiKey(request(`Bearer ${RAW_KEY}`))).not.toBeNull()
    expect(updates).toHaveLength(0)
  })

  it('rejects a wrong secret with a matching prefix', async () => {
    keyRows = [await keyRow()]
    expect(await verifyApiKey(request(`Bearer ${OTHER_KEY}`))).toBeNull()
    expect(updates).toHaveLength(0)
  })

  it('rejects a revoked key', async () => {
    keyRows = [await keyRow({ revoked: true })]
    expect(await verifyApiKey(request(`Bearer ${RAW_KEY}`))).toBeNull()
  })

  it('rejects an expired key', async () => {
    keyRows = [await keyRow({ expiresAt: new Date(Date.now() - 1000) })]
    expect(await verifyApiKey(request(`Bearer ${RAW_KEY}`))).toBeNull()
  })

  it('rejects an unknown prefix', async () => {
    keyRows = [await keyRow({ keyPrefix: 'idr_00000000' })]
    expect(await verifyApiKey(request(`Bearer ${RAW_KEY}`))).toBeNull()
  })

  it('returns null without an idr_ bearer token', async () => {
    expect(await verifyApiKey(request())).toBeNull()
    expect(await verifyApiKey(request('Bearer not-an-api-key'))).toBeNull()
    expect(lookedUpPrefix).toBeUndefined()
  })

  it('picks the matching key when two keys share a prefix', async () => {
    keyRows = [
      await keyRow({ id: 'key-other', keyHash: await bcrypt.hash(OTHER_KEY, 4), orgId: 'org-2' }),
      await keyRow(),
    ]
    expect((await verifyApiKey(request(`Bearer ${RAW_KEY}`)))?.orgId).toBe('org-1')
  })
})
