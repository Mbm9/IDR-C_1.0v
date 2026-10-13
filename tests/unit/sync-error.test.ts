import { describe, it, expect } from 'vitest'
import { summarizeSyncError, summarizeRecordErrors, redactSecrets } from '@/lib/connectors/sync-error'

describe('summarizeSyncError', () => {
  it('strips the engine prefix and keeps the first line only', () => {
    const err = new Error('Sync failed for okta: Connection test failed: 401 Unauthorized\n    at foo (bar.js:1:1)')
    expect(summarizeSyncError(err)).toBe('Connection test failed: 401 Unauthorized')
  })

  it('redacts credentials in URLs, headers and key=value pairs', () => {
    const msg = summarizeSyncError(
      'GET https://svc:Sup3rS3cret@vault.example.com/v1 failed; Authorization: Bearer abcdefghijklmnop12345 password=hunter22 apiKey: "k-123456"'
    )
    expect(msg).not.toMatch(/Sup3rS3cret|abcdefghijklmnop12345|hunter22|k-123456/)
    expect(msg).toContain('vault.example.com')
  })

  it('redacts long opaque tokens and truncates long messages', () => {
    const token = 'A'.repeat(64)
    expect(redactSecrets(`token was ${token}`)).not.toContain(token)
    expect(summarizeSyncError('x'.repeat(1000) + ' end').length).toBeLessThanOrEqual(300)
  })

  it('falls back for empty or unknown errors', () => {
    expect(summarizeSyncError(undefined)).toBe('Unknown error')
    expect(summarizeSyncError(new Error(''))).toBe('Unknown error')
  })
})

describe('summarizeRecordErrors', () => {
  it('returns null when there are no errors', () => {
    expect(summarizeRecordErrors([])).toBeNull()
  })
  it('counts failures and shows the first one', () => {
    expect(summarizeRecordErrors(['Identity a: boom', 'Identity b: boom'])).toBe('2 records failed: Identity a: boom')
    expect(summarizeRecordErrors(['Group x: bad'])).toBe('1 record failed: Group x: bad')
  })
})
