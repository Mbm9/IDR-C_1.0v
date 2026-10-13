// Issue aggregation + lifecycle/timeline engine.
//
// Rolls Identity Radar's individual findings (policy_violations + exposure_findings) up into
// fsProtect-style "issues" (one per finding TYPE, identified by FSID), and derives timeline
// events (first detected / reappeared / risk increased / remediated) across scans.

import { db } from '@/lib/db'
import {
  policyViolations, exposureFindings, identities, issueStatus, issueEvents,
} from '@/lib/db/schema'
import { eq, and, count, desc } from 'drizzle-orm'
import { getIssueDef, type IssueDef, type IssueCategory } from './catalog'
import { localizeIssue, type IssueLocale } from './localize'

const POSTURE_NOTE = 'identity' as const

export interface IssueRow {
  fsid: string
  type: string
  source: 'violation' | 'exposure'
  name: string
  category: IssueCategory
  severity: IssueDef['severity']
  impact: string
  mitre: string[]
  certainty: IssueDef['certainty']
  privilege: IssueDef['privilege']
  ease: IssueDef['ease']
  affectedCount: number
  exposurePoints: number
  status: 'no_action' | 'in_progress' | 'done' | 'accepted_risk'
  firstDetectedAt: string | null
  lastSeenAt: string | null
}

interface AggItem { type: string; source: 'violation' | 'exposure'; category: IssueCategory; count: number }

/** Current open findings grouped by type. */
async function aggregate(orgId: string): Promise<AggItem[]> {
  const [pv, ef] = await Promise.all([
    db.select({ type: policyViolations.violationType, c: count() })
      .from(policyViolations)
      .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open')))
      .groupBy(policyViolations.violationType),
    db.select({ type: exposureFindings.findingType, category: exposureFindings.category, c: count() })
      .from(exposureFindings)
      .where(and(eq(exposureFindings.orgId, orgId), eq(exposureFindings.status, 'open')))
      .groupBy(exposureFindings.findingType, exposureFindings.category),
  ])
  const items: AggItem[] = []
  for (const r of pv) items.push({ type: r.type, source: 'violation', category: POSTURE_NOTE, count: Number(r.c) })
  for (const r of ef) items.push({ type: r.type, source: 'exposure', category: r.category as IssueCategory, count: Number(r.c) })
  return items
}

/** Issue list; `locale` controls the language of `name` (all other fields are locale-neutral). */
export async function getIssues(orgId: string, locale: IssueLocale = 'en'): Promise<IssueRow[]> {
  const items = await aggregate(orgId)
  const statuses = await db.select().from(issueStatus).where(eq(issueStatus.orgId, orgId))
  const statusByFsid = new Map(statuses.map((s) => [s.fsid, s]))

  const rows: IssueRow[] = items.map((it) => {
    const d = localizeIssue(getIssueDef(it.type, { category: it.category }), locale)
    const st = statusByFsid.get(d.fsid)
    return {
      fsid: d.fsid, type: it.type, source: it.source, name: d.name, category: d.category,
      severity: d.severity, impact: d.impact, mitre: d.mitre, certainty: d.certainty,
      privilege: d.privilege, ease: d.ease,
      affectedCount: it.count, exposurePoints: it.count * d.exposurePoints,
      status: st?.status ?? 'no_action',
      firstDetectedAt: st?.firstDetectedAt ? st.firstDetectedAt.toISOString() : null,
      lastSeenAt: st?.lastSeenAt ? st.lastSeenAt.toISOString() : null,
    }
  })
  rows.sort((a, b) => b.exposurePoints - a.exposurePoints)
  return rows
}

/** Issue detail; `locale` controls the language of the returned `def` text (name, description, mitigation). */
export async function getIssueDetail(orgId: string, fsid: string, locale: IssueLocale = 'en') {
  const items = await aggregate(orgId)
  const match = items.find((it) => getIssueDef(it.type, { category: it.category }).fsid === fsid)
  // catalog def even if currently 0 affected
  const baseDef = match ? getIssueDef(match.type, { category: match.category }) : findDefByFsid(fsid)
  if (!baseDef) return null
  const def = localizeIssue(baseDef, locale)

  const [st] = await db.select().from(issueStatus).where(and(eq(issueStatus.orgId, orgId), eq(issueStatus.fsid, fsid))).limit(1)
  const events = await db.select().from(issueEvents)
    .where(and(eq(issueEvents.orgId, orgId), eq(issueEvents.fsid, fsid)))
    .orderBy(desc(issueEvents.createdAt)).limit(50)

  // sample affected objects
  let affected: { name: string; ref?: string }[] = []
  if (match?.source === 'violation') {
    const rows = await db.select({ name: identities.displayName, id: identities.id })
      .from(policyViolations).innerJoin(identities, eq(policyViolations.identityId, identities.id))
      .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open'), eq(policyViolations.violationType, match.type as any)))
      .limit(100)
    affected = rows.map((r) => ({ name: r.name, ref: r.id }))
  } else if (match?.source === 'exposure') {
    const rows = await db.select({ name: exposureFindings.subjectName })
      .from(exposureFindings)
      .where(and(eq(exposureFindings.orgId, orgId), eq(exposureFindings.status, 'open'), eq(exposureFindings.findingType, match.type)))
      .limit(100)
    affected = rows.map((r) => ({ name: r.name }))
  }

  return {
    def,
    affectedCount: match?.count ?? 0,
    exposurePoints: (match?.count ?? 0) * def.exposurePoints,
    status: st?.status ?? 'no_action',
    notes: st?.notes ?? null,
    firstDetectedAt: st?.firstDetectedAt?.toISOString() ?? null,
    lastSeenAt: st?.lastSeenAt?.toISOString() ?? null,
    affected,
    events: events.map((e) => ({ type: e.eventType, affectedCount: e.affectedCount, detail: e.detail, at: e.createdAt.toISOString() })),
  }
}

function findDefByFsid(fsid: string): IssueDef | null {
  // best-effort: derive type from fsid
  const type = fsid.replace(/^FS-/, '').toLowerCase().replace(/-/g, '_')
  return getIssueDef(type)
}

/** Update operator status for an issue (and log a status_changed event). */
export async function setIssueStatus(orgId: string, fsid: string, status: IssueRow['status'], notes?: string) {
  const [existing] = await db.select().from(issueStatus).where(and(eq(issueStatus.orgId, orgId), eq(issueStatus.fsid, fsid))).limit(1)
  if (existing) {
    await db.update(issueStatus).set({ status, notes: notes ?? existing.notes, updatedAt: new Date() }).where(eq(issueStatus.id, existing.id))
  } else {
    await db.insert(issueStatus).values({ orgId, fsid, status, notes, lastSeenAt: new Date(), firstDetectedAt: new Date() })
  }
  await db.insert(issueEvents).values({ orgId, fsid, eventType: 'status_changed', affectedCount: existing?.lastCount ?? 0, detail: status })
}

/**
 * Record timeline events by comparing current per-issue counts to the last-seen counts.
 * Call after each exposure scan.
 */
export async function recordIssueEvents(orgId: string): Promise<number> {
  const items = await aggregate(orgId)
  const current = new Map<string, { count: number; category: IssueCategory; type: string }>()
  for (const it of items) {
    const fsid = getIssueDef(it.type, { category: it.category }).fsid
    current.set(fsid, { count: it.count, category: it.category, type: it.type })
  }

  const statuses = await db.select().from(issueStatus).where(eq(issueStatus.orgId, orgId))
  const statusByFsid = new Map(statuses.map((s) => [s.fsid, s]))
  const now = new Date()
  let events = 0
  const addEvent = async (fsid: string, type: any, c: number) => {
    await db.insert(issueEvents).values({ orgId, fsid, eventType: type, affectedCount: c }); events++
  }

  // present issues
  for (const [fsid, cur] of current) {
    const prev = statusByFsid.get(fsid)
    if (!prev) {
      await db.insert(issueStatus).values({ orgId, fsid, lastCount: cur.count, firstDetectedAt: now, lastSeenAt: now })
      await addEvent(fsid, 'first_detected', cur.count)
    } else {
      if (prev.lastCount === 0 && cur.count > 0) await addEvent(fsid, 'reappeared', cur.count)
      else if (cur.count > prev.lastCount) await addEvent(fsid, 'risk_increased', cur.count)
      else if (cur.count < prev.lastCount && cur.count > 0) await addEvent(fsid, 'partially_remediated', cur.count)
      await db.update(issueStatus).set({ lastCount: cur.count, lastSeenAt: now, updatedAt: now }).where(eq(issueStatus.id, prev.id))
    }
  }
  // resolved issues (had count, now absent)
  for (const s of statuses) {
    if (!current.has(s.fsid) && s.lastCount > 0) {
      await addEvent(s.fsid, 'fully_remediated', 0)
      await db.update(issueStatus).set({ lastCount: 0, lastSeenAt: now, updatedAt: now }).where(eq(issueStatus.id, s.id))
    }
  }
  return events
}
