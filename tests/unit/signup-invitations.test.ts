import { hashInviteToken } from '@/lib/auth/invite-token'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Fake db: selects resolve from a queue in call order; inserts/updates are
// recorded per table. transaction() runs the callback against the same fake.
// ---------------------------------------------------------------------------
const selectQueue: unknown[][] = []
const inserts: Array<{ table: string; values: any }> = []
const updates: Array<{ table: string; values: any }> = []
let updateReturning: Record<string, unknown[]> = {}
let insertReturning: Record<string, unknown[]> = {}

vi.mock('@/lib/db', () => {
  const thenable = (result: () => unknown) => ({
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve().then(result).then(res, rej),
  })
  const selectChain = () => {
    let result: unknown[] | undefined
    const take = () => (result ??= selectQueue.shift() ?? [])
    const c: any = {
      from: () => c, where: () => c, orderBy: () => c, limit: () => c, for: () => c,
      ...thenable(take),
    }
    return c
  }
  const fake: any = {
    select: () => selectChain(),
    insert: (table: { __t: string }) => ({
      values: (values: any) => {
        inserts.push({ table: table.__t, values })
        return {
          returning: () => Promise.resolve(insertReturning[table.__t] ?? [{ id: `${table.__t}-new` }]),
          ...thenable(() => undefined),
        }
      },
    }),
    update: (table: { __t: string }) => ({
      set: (values: any) => {
        updates.push({ table: table.__t, values })
        return {
          where: () => ({
            returning: () => Promise.resolve(updateReturning[table.__t] ?? []),
            ...thenable(() => undefined),
          }),
        }
      },
    }),
  }
  fake.transaction = (fn: (tx: any) => Promise<unknown>) => fn(fake)
  return { db: fake }
})

vi.mock('@/lib/db/schema', () => {
  const table = (name: string) => new Proxy({ __t: name }, { get: (t, k) => (k in t ? (t as any)[k] : `${name}.${String(k)}`) })
  return {
    users: table('users'),
    invitations: table('invitations'),
    subscriptions: table('subscriptions'),
    organizations: table('organizations'),
    actionLog: table('action_log'),
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ inArray: [a, b] }),
  desc: (a: unknown) => ({ desc: a }),
  count: () => ({ count: true }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ sql: strings.join('?'), vals }),
}))

vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed-password' } }))

import { POST } from '@/app/api/auth/signup/route'

const DAY = 24 * 60 * 60 * 1000

function signup(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

const TOKEN = 'invite-token-0123456789abcdef'

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    tokenHash: hashInviteToken(TOKEN),
    email: 'New.Analyst@acmefs.sa',
    role: 'analyst',
    orgId: 'org-acme',
    invitedBy: 'admin-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 3 * DAY),
    createdAt: new Date(Date.now() - DAY),
    ...overrides,
  }
}

const body = { name: 'New Analyst', email: 'new.analyst@acmefs.sa', password: 'Sup3rSecret!' }
const invited = { ...body, inviteToken: TOKEN }

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    selectQueue.length = 0
    inserts.length = 0
    updates.length = 0
    updateReturning = {}
    insertReturning = {}
  })

  it('without an invitation: creates an org-less admin who goes through onboarding', async () => {
    selectQueue.push([], []) // no existing user, no pending invitations
    insertReturning.users = [{ id: 'user-new' }]

    const res = await signup(body)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ userId: 'user-new', joinedOrganization: null })

    const userInsert = inserts.find((i) => i.table === 'users')
    expect(userInsert?.values).toMatchObject({ email: body.email, appRole: 'admin', hashedPassword: 'hashed-password' })
    expect(userInsert?.values.orgId).toBeUndefined()
    expect(inserts.some((i) => i.table === 'action_log' || i.table === 'subscriptions' || i.table === 'organizations')).toBe(false)
  })

  it('with a pending invitation: joins the inviting org with the invited role and audits it', async () => {
    selectQueue.push(
      [],                          // existing user
      [invitation()],              // pending invitations
      [{ maxUsers: 10 }],          // subscription (locked)
      [{ total: 4 }],              // current members
      [{ name: 'Acme Financial Services' }], // org name for the response
    )
    updateReturning.invitations = [{ id: 'inv-1' }]
    insertReturning.users = [{ id: 'user-joined' }]

    const res = await signup(invited)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      userId: 'user-joined',
      joinedOrganization: { id: 'org-acme', name: 'Acme Financial Services', role: 'analyst' },
    })

    const userInsert = inserts.find((i) => i.table === 'users')
    expect(userInsert?.values).toMatchObject({ orgId: 'org-acme', appRole: 'analyst' })
    expect(updates).toContainEqual({ table: 'invitations', values: { status: 'accepted' } })

    const audit = inserts.find((i) => i.table === 'action_log')
    expect(audit?.values).toMatchObject({
      actionType: 'invite_user',
      actorIdentityId: 'user-joined',
      orgId: 'org-acme',
      payload: { operation: 'accepted', invitationId: 'inv-1', role: 'analyst' },
    })
    // No new organization or subscription for invited users.
    expect(inserts.some((i) => i.table === 'organizations' || i.table === 'subscriptions')).toBe(false)
  })

  it('marks expired invitations expired and falls back to the normal flow', async () => {
    selectQueue.push([], [invitation({ id: 'inv-old', expiresAt: new Date(Date.now() - DAY) })])
    insertReturning.users = [{ id: 'user-new' }]

    const res = await signup(body)
    expect(res.status).toBe(201)
    expect((await res.json()).joinedOrganization).toBeNull()
    expect(updates).toContainEqual({ table: 'invitations', values: { status: 'expired' } })
    expect(inserts.find((i) => i.table === 'users')?.values).toMatchObject({ appRole: 'admin' })
    expect(inserts.some((i) => i.table === 'action_log')).toBe(false)
  })

  it('enforces the subscription user limit for invited signups', async () => {
    selectQueue.push([], [invitation()], [{ maxUsers: 3 }], [{ total: 3 }])

    const res = await signup(invited)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/user limit/i)
    expect(inserts).toHaveLength(0)
    expect(updates.some((u) => u.values.status === 'accepted')).toBe(false)
  })

  it('rejects an invitation that was accepted or revoked concurrently', async () => {
    selectQueue.push([], [invitation()], [], [])
    updateReturning.invitations = [] // conditional update matched nothing

    const res = await signup(invited)
    expect(res.status).toBe(409)
    expect(inserts.some((i) => i.table === 'users')).toBe(false)
  })

  it('rejects an existing email (case-insensitive) and bad input', async () => {
    selectQueue.push([{ id: 'u-1' }])
    expect((await signup({ ...body, email: 'NEW.ANALYST@acmefs.sa' })).status).toBe(409)

    expect((await signup({ email: 'a@b.sa' })).status).toBe(400)
    expect((await signup({ ...body, password: 'short' })).status).toBe(400)
    expect((await signup({ ...body, email: 'not-an-email' })).status).toBe(400)
  })

  it('does not join an org without the invite token, even if the email is invited', async () => {
    selectQueue.push([], [invitation()]) // pending invitation exists for this email
    insertReturning.users = [{ id: 'user-new' }]

    const res = await signup(body)
    expect(res.status).toBe(201)
    expect((await res.json()).joinedOrganization).toBeNull()
    expect(updates).not.toContainEqual({ table: 'invitations', values: { status: 'accepted' } })
  })

  it('rejects a wrong invite token', async () => {
    selectQueue.push([], [invitation()])
    const res = await signup({ ...body, inviteToken: 'some-other-token-0000000000' })
    expect(res.status).toBe(400)
    expect(inserts.find((x: any) => x.table === 'users')).toBeUndefined()
  })
})
