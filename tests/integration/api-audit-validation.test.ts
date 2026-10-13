/**
 * UAT-108 (invalid bodies → 400 with field errors, not 500) and
 * UAT-117 (mutations write an action_log entry with a specific action type).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSession = {
  user: { id: 'test-user-id', email: 'admin@test.com', name: 'Test Admin', orgId: 'test-org-id', appRole: 'admin' },
}

// ── Auth ────────────────────────────────────────────────────────────────
const mockAuth = vi.fn()
vi.mock('@/lib/auth/config', () => ({ auth: () => mockAuth() }))

vi.mock('@/lib/logger', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}))

// ── DB: every query builder chain resolves to the next queued result for its verb ──
const results: Record<'select' | 'insert' | 'update' | 'delete', any[][]> = {
  select: [], insert: [], update: [], delete: [],
}
function chain(verb: keyof typeof results) {
  const proxy: any = new Proxy(() => proxy, {
    get(_t, prop) {
      if (prop === 'then') {
        const next = results[verb].length ? results[verb].shift() : []
        return (resolve: any, reject: any) => Promise.resolve(next).then(resolve, reject)
      }
      return () => proxy
    },
  })
  return proxy
}
vi.mock('@/lib/db', () => ({
  db: {
    select: () => chain('select'),
    insert: () => chain('insert'),
    update: () => chain('update'),
    delete: () => chain('delete'),
  },
}))

// ── logAction spy (keep the real parseJsonBody / badRequest) ────────────
const mockLogAction = vi.fn(async (..._args: any[]) => [])
vi.mock('@/lib/actions/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/actions/helpers')>()
  return { ...actual, logAction: (...args: any[]) => mockLogAction(...args) }
})

const mockSetIssueStatus = vi.fn(async (..._args: any[]) => undefined)
vi.mock('@/lib/issues/aggregate', () => ({
  getIssueDetail: vi.fn(),
  setIssueStatus: (...args: any[]) => mockSetIssueStatus(...args),
}))

vi.mock('@/lib/webhooks/sender', () => ({ sendWebhook: vi.fn(async () => true) }))

import { PATCH as patchIssue } from '@/app/api/issues/[fsid]/route'
import { POST as postGpo } from '@/app/api/gpo/route'
import { PUT as putAutomationRule } from '@/app/api/automation-rules/[id]/route'
import { PATCH as patchThreat } from '@/app/api/threats/[id]/route'
import { POST as postWebhook } from '@/app/api/webhooks/route'
import { parseJsonBody } from '@/lib/actions/helpers'

const ORG = mockSession.user.orgId
const RULE_ID = '6f1c1f4e-8a52-4d5e-9a1c-0b1b2c3d4e5f'
const THREAT_ID = '0a8b5a1e-1111-4c4c-8d8d-123456789abc'
const IDENTITY_ID = '9d3f2b7a-2222-4e4e-9f9f-abcdefabcdef'

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function sessionWithRole(appRole: string) {
  return { user: { ...mockSession.user, appRole } }
}

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockResolvedValue(sessionWithRole('admin'))
  mockLogAction.mockClear()
  mockSetIssueStatus.mockClear()
  for (const k of Object.keys(results) as (keyof typeof results)[]) results[k] = []
})

describe('parseJsonBody', () => {
  it('returns 400 for malformed JSON', async () => {
    const { z } = await import('zod')
    const r = await parseJsonBody(jsonReq('/x', 'POST', '{not json'), z.object({ a: z.string() }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(400)
      expect((await r.response.json()).error).toBe('Malformed JSON body')
    }
  })

  it('treats an empty body as {} so missing fields are reported', async () => {
    const { z } = await import('zod')
    const r = await parseJsonBody(new NextRequest('http://localhost/x', { method: 'POST' }), z.object({ a: z.string() }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const body = await r.response.json()
      expect(body.details.fieldErrors.a).toBeDefined()
    }
  })
})

describe('PATCH /api/issues/[fsid] (UAT-108)', () => {
  const ctx = { params: { fsid: 'FS-KERBEROASTABLE' } }

  it('returns 400 with field errors for an invalid status', async () => {
    const res = await patchIssue(jsonReq('/api/issues/FS-KERBEROASTABLE', 'PATCH', { status: 'bogus' }), ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid input')
    expect(body.details.fieldErrors.status).toBeDefined()
    expect(mockSetIssueStatus).not.toHaveBeenCalled()
    expect(mockLogAction).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON instead of 500', async () => {
    const res = await patchIssue(jsonReq('/api/issues/FS-KERBEROASTABLE', 'PATCH', '{"status":'), ctx)
    expect(res.status).toBe(400)
  })

  it('writes an update_finding_status audit entry on success', async () => {
    results.select.push([{ status: 'no_action' }])
    const res = await patchIssue(jsonReq('/api/issues/FS-KERBEROASTABLE', 'PATCH', { status: 'in_progress', notes: 'ticket CHG-1' }), ctx)
    expect(res.status).toBe(200)
    expect(mockSetIssueStatus).toHaveBeenCalledWith(ORG, 'FS-KERBEROASTABLE', 'in_progress', 'ticket CHG-1')
    expect(mockLogAction).toHaveBeenCalledTimes(1)
    expect(mockLogAction.mock.calls[0][0]).toMatchObject({
      actionType: 'update_finding_status',
      actorIdentityId: mockSession.user.id,
      orgId: ORG,
      rationale: 'ticket CHG-1',
      payload: { findingType: 'issue', fsid: 'FS-KERBEROASTABLE', previousStatus: 'no_action', newStatus: 'in_progress' },
    })
  })

  it('keeps the analyst role requirement', async () => {
    mockAuth.mockResolvedValue(sessionWithRole('viewer'))
    const res = await patchIssue(jsonReq('/api/issues/FS-KERBEROASTABLE', 'PATCH', { status: 'done' }), ctx)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/gpo (UAT-108)', () => {
  it('returns 400 with field errors when name is missing and types are wrong', async () => {
    const res = await postGpo(jsonReq('/api/gpo', 'POST', { version: 'seven', adTier: 'tier_9' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details.fieldErrors.name).toBeDefined()
    expect(body.details.fieldErrors.version).toBeDefined()
    expect(body.details.fieldErrors.adTier).toBeDefined()
    expect(mockLogAction).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await postGpo(jsonReq('/api/gpo', 'POST', 'nope'))
    expect(res.status).toBe(400)
  })

  it('creates the GPO and writes a manage_gpo audit entry', async () => {
    results.insert.push([{ id: 'gpo-1', name: 'Default Domain Policy', gpoGuid: null, adTier: 'tier_0', status: 'enabled' }])
    const res = await postGpo(jsonReq('/api/gpo', 'POST', { name: 'Default Domain Policy', adTier: 'tier_0' }))
    expect(res.status).toBe(201)
    expect(mockLogAction).toHaveBeenCalledTimes(1)
    expect(mockLogAction.mock.calls[0][0]).toMatchObject({
      actionType: 'manage_gpo',
      payload: { operation: 'create', gpoId: 'gpo-1', name: 'Default Domain Policy' },
    })
  })

  it('keeps the iam_admin role requirement', async () => {
    mockAuth.mockResolvedValue(sessionWithRole('analyst'))
    const res = await postGpo(jsonReq('/api/gpo', 'POST', { name: 'x' }))
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/automation-rules/[id] (UAT-108)', () => {
  const ctx = { params: Promise.resolve({ id: RULE_ID }) }

  it('returns 400 with field errors for wrong types', async () => {
    const res = await putAutomationRule(jsonReq(`/api/automation-rules/${RULE_ID}`, 'PUT', { enabled: 'yes', triggerType: 'whenever' }), ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details.fieldErrors.enabled).toBeDefined()
    expect(body.details.fieldErrors.triggerType).toBeDefined()
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await putAutomationRule(jsonReq(`/api/automation-rules/${RULE_ID}`, 'PUT', '{'), ctx)
    expect(res.status).toBe(400)
  })

  it('returns 400 when no updatable field is provided', async () => {
    const res = await putAutomationRule(jsonReq(`/api/automation-rules/${RULE_ID}`, 'PUT', {}), ctx)
    expect(res.status).toBe(400)
  })

  it('updates the rule and writes a manage_automation_rule audit entry with before/after', async () => {
    results.select.push([{ enabled: true }])
    results.update.push([{ id: RULE_ID, name: 'Auto-disable dormant', enabled: false }])
    const res = await putAutomationRule(jsonReq(`/api/automation-rules/${RULE_ID}`, 'PUT', { enabled: false }), ctx)
    expect(res.status).toBe(200)
    expect(mockLogAction).toHaveBeenCalledTimes(1)
    expect(mockLogAction.mock.calls[0][0]).toMatchObject({
      actionType: 'manage_automation_rule',
      actorIdentityId: mockSession.user.id,
      payload: { operation: 'update', ruleId: RULE_ID, changedFields: ['enabled'], previousEnabled: true, newEnabled: false },
    })
  })

  it('returns 404 for a rule outside the org', async () => {
    results.select.push([])
    const res = await putAutomationRule(jsonReq(`/api/automation-rules/${RULE_ID}`, 'PUT', { enabled: false }), ctx)
    expect(res.status).toBe(404)
    expect(mockLogAction).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/threats/[id] (UAT-117)', () => {
  const ctx = { params: { id: THREAT_ID } }

  it('logs update_threat_status with previous and new status and the rationale', async () => {
    results.select.push([{ id: THREAT_ID, identityId: IDENTITY_ID, status: 'active', threatType: 'kerberoasting' }])
    results.update.push([{ id: THREAT_ID, status: 'resolved' }])
    const res = await patchThreat(jsonReq(`/api/threats/${THREAT_ID}`, 'PATCH', { status: 'resolved', rationale: 'Password rotated' }), ctx)
    expect(res.status).toBe(200)
    expect(mockLogAction.mock.calls[0][0]).toMatchObject({
      actionType: 'update_threat_status',
      targetIdentityId: IDENTITY_ID,
      rationale: 'Password rotated',
      payload: { threatId: THREAT_ID, previousStatus: 'active', newStatus: 'resolved' },
    })
  })

  it('returns 400 with field errors for an invalid status', async () => {
    const res = await patchThreat(jsonReq(`/api/threats/${THREAT_ID}`, 'PATCH', { status: 'closed' }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).details.fieldErrors.status).toBeDefined()
  })
})

describe('POST /api/webhooks (UAT-117)', () => {
  it('logs manage_webhook without the signing secret or full URL', async () => {
    results.insert.push([{ id: 'wh-1', name: 'SIEM', url: 'https://siem.example.com/hook?token=abc', secret: 's3cr3t', events: ['violation_detected'] }])
    const res = await postWebhook(jsonReq('/api/webhooks', 'POST', {
      name: 'SIEM', url: 'https://siem.example.com/hook?token=abc', secret: 's3cr3t', events: ['violation_detected'],
    }))
    expect(res.status).toBe(201)
    const entry = mockLogAction.mock.calls[0][0]
    expect(entry.actionType).toBe('manage_webhook')
    expect(entry.payload).toMatchObject({ operation: 'create', webhookId: 'wh-1', host: 'siem.example.com', hasSecret: true })
    const serialized = JSON.stringify(entry)
    expect(serialized).not.toContain('s3cr3t')
    expect(serialized).not.toContain('token=abc')
    expect(JSON.stringify(await res.json())).not.toContain('s3cr3t')
  })

  it('returns 400 with field errors when events is empty', async () => {
    const res = await postWebhook(jsonReq('/api/webhooks', 'POST', { name: 'x', url: 'https://a.example.com', events: [] }))
    expect(res.status).toBe(400)
    expect((await res.json()).details.fieldErrors.events).toBeDefined()
  })
})
