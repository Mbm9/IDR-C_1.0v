import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/config', () => ({ auth: () => mockAuth() }))

const mockVerifyApiKey = vi.fn()
vi.mock('@/lib/auth/api-key', async () => {
  const token = await vi.importActual<typeof import('@/lib/auth/api-key-token')>('@/lib/auth/api-key-token')
  return { extractApiKey: token.extractApiKey, verifyApiKey: (req: unknown) => mockVerifyApiKey(req) }
})

const mockLogAction = vi.fn()
vi.mock('@/lib/actions/helpers', async () => {
  const actual = await vi.importActual<any>('@/lib/actions/helpers')
  return { ...actual, logAction: (p: unknown) => mockLogAction(p) }
})

const inserted: any[] = []
let updateReturning: unknown[] = []
const updateSets: any[] = []
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const c: any = { from: () => c, where: () => c, limit: () => c, then: (r: any) => Promise.resolve([]).then(r) }
      return c
    },
    insert: () => ({
      values: (rows: any[]) => {
        inserted.push(...rows)
        return { returning: () => Promise.resolve(rows.map((_, i) => ({ id: `ev-${i}` }))) }
      },
    }),
    update: () => ({
      set: (v: any) => {
        updateSets.push(v)
        return { where: () => ({ returning: () => Promise.resolve(updateReturning) }) }
      },
    }),
  },
}))

import { POST as ingest } from '@/app/api/events/ingest/route'
import { DELETE as revokeInvite } from '@/app/api/settings/team/route'

const RAW_KEY = 'idr_' + '0123abcd'.repeat(8)
const events = [{ eventType: 'login_success', source: 'splunk', eventTimestamp: '2026-10-13T07:00:00Z' }]

function ingestRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/events/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ events }),
  })
}

describe('POST /api/events/ingest with API keys', () => {
  beforeEach(() => {
    inserted.length = 0
    mockAuth.mockReset()
    mockVerifyApiKey.mockReset()
  })

  it('accepts a valid key and writes events into the key org', async () => {
    mockVerifyApiKey.mockResolvedValue({ keyId: 'k-1', keyPrefix: 'idr_0123abcd', orgId: 'org-key', appRole: 'analyst' })
    const res = await ingest(ingestRequest({ authorization: `Bearer ${RAW_KEY}` }))
    expect(res.status).toBe(200)
    expect((await res.json()).inserted).toBe(1)
    expect(inserted[0].orgId).toBe('org-key')
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it('rejects an invalid or revoked key with 401 and never falls back to the session', async () => {
    mockVerifyApiKey.mockResolvedValue(null)
    mockAuth.mockResolvedValue({ user: { id: 'u', orgId: 'org-session', appRole: 'admin' } })
    const res = await ingest(ingestRequest({ authorization: `Bearer ${RAW_KEY}` }))
    expect(res.status).toBe(401)
    expect(mockAuth).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })

  it('rejects a malformed idr_ token with 401', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', orgId: 'org-session', appRole: 'admin' } })
    const res = await ingest(ingestRequest({ authorization: 'Bearer idr_nope' }))
    expect(res.status).toBe(401)
  })

  it('still supports session auth (analyst and above)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', orgId: 'org-session', appRole: 'analyst' } })
    const ok = await ingest(ingestRequest({}))
    expect(ok.status).toBe(200)
    expect(inserted[0].orgId).toBe('org-session')

    mockAuth.mockResolvedValue({ user: { id: 'u', orgId: 'org-session', appRole: 'viewer' } })
    expect((await ingest(ingestRequest({}))).status).toBe(403)
  })
})

describe('DELETE /api/settings/team (revoke invitation)', () => {
  const INVITE_ID = '7d1f3c1e-8a7b-4f8e-9a37-2a5c1d9b0e11'
  const del = (body: unknown) => revokeInvite(new NextRequest('http://localhost/api/settings/team', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))

  beforeEach(() => {
    mockLogAction.mockReset()
    updateSets.length = 0
    updateReturning = []
  })

  it('revokes a pending invitation and audits it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', orgId: 'org-1', appRole: 'admin' } })
    updateReturning = [{ id: INVITE_ID, email: 'x@acmefs.sa', role: 'viewer' }]
    const res = await del({ invitationId: INVITE_ID })
    expect(res.status).toBe(200)
    expect(updateSets).toEqual([{ status: 'revoked' }])
    expect(mockLogAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'invite_user',
      orgId: 'org-1',
      payload: expect.objectContaining({ operation: 'revoked', invitationId: INVITE_ID }),
    }))
  })

  it('returns 404 when no pending invitation matches in the org', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', orgId: 'org-1', appRole: 'admin' } })
    expect((await del({ invitationId: INVITE_ID })).status).toBe(404)
    expect(mockLogAction).not.toHaveBeenCalled()
  })

  it('requires admin and a valid id', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', orgId: 'org-1', appRole: 'ciso' } })
    expect((await del({ invitationId: INVITE_ID })).status).toBe(403)
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', orgId: 'org-1', appRole: 'admin' } })
    expect((await del({ invitationId: 'nope' })).status).toBe(400)
  })
})
