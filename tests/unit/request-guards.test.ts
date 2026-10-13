import { describe, it, expect, afterEach, vi } from 'vitest'
import { validateContentType, validateRequestSize } from '@/lib/middleware/security'
import { clientIp } from '@/lib/middleware/rate-limit'
import { verifyCronSecret } from '@/lib/auth/cron'

function req(method: string, headers: Record<string, string> = {}) {
  return { method, headers: new Headers(headers) }
}

describe('validateContentType', () => {
  it('allows GET without a content type', () => {
    expect(validateContentType(req('GET'))).toBeNull()
  })

  it('allows body-less mutations (no content-length, no content-type)', () => {
    expect(validateContentType(req('DELETE'))).toBeNull()
    expect(validateContentType(req('PATCH'))).toBeNull()
  })

  it('allows POST with content-length 0 and no content type', () => {
    expect(validateContentType(req('POST', { 'content-length': '0' }))).toBeNull()
  })

  it('rejects a mutation with a body but no JSON content type', () => {
    const res = validateContentType(req('POST', { 'content-length': '12', 'content-type': 'text/plain' }))
    expect(res?.status).toBe(415)
  })

  it('rejects a chunked body with no content type', () => {
    const res = validateContentType(req('PUT', { 'transfer-encoding': 'chunked' }))
    expect(res?.status).toBe(415)
  })

  it('accepts JSON and multipart bodies', () => {
    expect(validateContentType(req('POST', { 'content-length': '2', 'content-type': 'application/json; charset=utf-8' }))).toBeNull()
    expect(validateContentType(req('POST', { 'content-length': '200', 'content-type': 'multipart/form-data; boundary=x' }))).toBeNull()
  })
})

describe('validateRequestSize', () => {
  it('rejects bodies over 1 MB', () => {
    expect(validateRequestSize(req('POST', { 'content-length': String(2 * 1024 * 1024) }))?.status).toBe(413)
    expect(validateRequestSize(req('POST', { 'content-length': '10' }))).toBeNull()
  })
})

describe('clientIp', () => {
  it('prefers X-Real-IP set by the reverse proxy', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '10.0.0.5', 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.5')
  })

  it('uses the right-most X-Forwarded-For hop, not the client-supplied left-most', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('falls back to loopback', () => {
    expect(clientIp(new Headers())).toBe('127.0.0.1')
  })
})

describe('verifyCronSecret', () => {
  afterEach(() => vi.unstubAllEnvs())

  const withAuth = (value?: string) =>
    new Request('http://x/api/cron/risk-scorer', value ? { headers: { authorization: value } } : {})

  it('accepts the exact bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect(verifyCronSecret(withAuth('Bearer s3cret'))).toBe(true)
  })

  it('rejects a wrong or missing secret', () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect(verifyCronSecret(withAuth('Bearer nope'))).toBe(false)
    expect(verifyCronSecret(withAuth('Bearer s3cretX'))).toBe(false)
    expect(verifyCronSecret(withAuth())).toBe(false)
  })

  it('denies in production when no secret is configured', () => {
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(verifyCronSecret(withAuth())).toBe(false)
  })

  it('allows in development when no secret is configured', () => {
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(verifyCronSecret(withAuth())).toBe(true)
  })
})
