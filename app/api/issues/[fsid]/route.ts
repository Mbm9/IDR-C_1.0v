import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { getIssueDetail, setIssueStatus } from '@/lib/issues/aggregate'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'
import { db } from '@/lib/db'
import { issueStatus } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

/** GET /api/issues/[fsid] — issue detail: metadata, mitigation, affected objects, timeline. */
export const GET = withApiHandler(async (_req: NextRequest, { orgId, params }) => {
  const fsid = params?.fsid as string
  const detail = await getIssueDetail(orgId, fsid)
  if (!detail) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
  return NextResponse.json(detail)
})

const patchSchema = z.object({
  status: z.enum(['no_action', 'in_progress', 'done', 'accepted_risk']),
  notes: z.string().max(2000).optional(),
})

/** PATCH /api/issues/[fsid] — update operator status / notes. */
export const PATCH = withApiHandler(async (req: NextRequest, { orgId, session, params, log }) => {
  const fsid = params?.fsid as string
  const parsed = await parseJsonBody(req, patchSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const [previous] = await db.select({ status: issueStatus.status })
    .from(issueStatus)
    .where(and(eq(issueStatus.orgId, orgId), eq(issueStatus.fsid, fsid)))
    .limit(1)

  await setIssueStatus(orgId, fsid, body.status, body.notes)

  await logAction({
    actionType: 'update_finding_status',
    actorIdentityId: session.user.id,
    orgId,
    payload: {
      findingType: 'issue',
      fsid,
      previousStatus: previous?.status ?? 'no_action',
      newStatus: body.status,
      notesUpdated: body.notes !== undefined,
    },
    rationale: body.notes ?? null,
  })

  log.info('Issue status updated', { fsid, status: body.status })
  return NextResponse.json({ ok: true })
}, { requiredRole: 'analyst' })
