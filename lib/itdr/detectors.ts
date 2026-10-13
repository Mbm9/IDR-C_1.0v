import { db } from '@/lib/db'
import { identityEvents, identities, detectionRules, identityThreats } from '@/lib/db/schema'
import { eq, and, gte, sql, inArray } from 'drizzle-orm'

// ── Types ──

export interface DetectionContext {
  orgId: string
  events: IdentityEventRow[]
  rule: DetectionRuleRow
}

export interface DetectionResult {
  detected: boolean
  threatType: string
  severity: string
  identityId: string
  evidence: any
  confidence: number
  killChainPhase: string
  mitreTechniqueIds: string[]
  sourceIp?: string
  sourceLocation?: string
  targetResource?: string
}

type IdentityEventRow = typeof identityEvents.$inferSelect
type DetectionRuleRow = typeof detectionRules.$inferSelect

// ── Main entry point ──

export async function runDetectionRules(orgId: string): Promise<DetectionResult[]> {
  // Load enabled rules
  const rules = await db
    .select()
    .from(detectionRules)
    .where(and(eq(detectionRules.orgId, orgId), eq(detectionRules.enabled, true)))

  // Load recent events (last 15 minutes)
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)
  const recentEvents = await db
    .select()
    .from(identityEvents)
    .where(and(
      eq(identityEvents.orgId, orgId),
      gte(identityEvents.eventTimestamp, fifteenMinAgo),
    ))

  const results: DetectionResult[] = []

  for (const rule of rules) {
    const ctx: DetectionContext = { orgId, events: recentEvents, rule }
    const detector = DETECTOR_MAP[rule.threatType]
    if (!detector) continue

    try {
      const detections = await detector(ctx)
      results.push(...detections.filter(d => d.detected))
    } catch (err) {
      console.error(`[ITDR] Detector ${rule.threatType} failed:`, err)
    }
  }

  return results
}

// ── Detector registry ──

type DetectorFn = (ctx: DetectionContext) => Promise<DetectionResult[]>

const DETECTOR_MAP: Record<string, DetectorFn> = {
  password_spray: passwordSprayDetector,
  credential_stuffing: credentialStuffingDetector,
  mfa_fatigue: mfaFatigueDetector,
  token_replay: tokenReplayDetector,
  impossible_travel: impossibleTravelDetector,
  privilege_escalation: privilegeEscalationDetector,
  lateral_movement: lateralMovementDetector,
  golden_ticket: goldenTicketDetector,
  dcsync: dcsyncDetector,
  service_account_abuse: serviceAccountAbuseDetector,
}

// ── Helper functions ──

function getParsedField(event: IdentityEventRow, field: string): any {
  const parsed = event.parsedFields as Record<string, any> | null
  return parsed?.[field]
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    if (!key) continue
    const arr = map.get(key) || []
    arr.push(item)
    map.set(key, arr)
  }
  return map
}

// ── 1. Password Spray — >5 failed logins from same IP against different accounts in 10 min ──

async function passwordSprayDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
  const failures = ctx.events.filter(e =>
    e.eventType === 'login_failure' &&
    e.eventTimestamp >= tenMinAgo &&
    getParsedField(e, 'ipAddress')
  )

  const byIp = groupBy(failures, e => getParsedField(e, 'ipAddress'))
  const results: DetectionResult[] = []

  for (const [ip, events] of byIp) {
    const uniqueIdentities = new Set(events.map(e => e.identityId).filter(Boolean))
    if (uniqueIdentities.size > 5) {
      const firstIdentityId = events.find(e => e.identityId)?.identityId
      if (!firstIdentityId) continue
      results.push({
        detected: true,
        threatType: 'password_spray',
        severity: 'high',
        identityId: firstIdentityId,
        evidence: {
          eventIds: events.map(e => e.id),
          summary: `${uniqueIdentities.size} unique accounts targeted from IP ${ip} in 10 minutes`,
          targetedAccounts: uniqueIdentities.size,
        },
        confidence: Math.min(95, 60 + uniqueIdentities.size * 5),
        killChainPhase: 'credential_access',
        mitreTechniqueIds: ['T1110.003'],
        sourceIp: ip,
        sourceLocation: getParsedField(events[0], 'location'),
      })
    }
  }

  return results
}

// ── 2. Credential Stuffing — >10 failed logins to single account in 5 min from different IPs ──

async function credentialStuffingDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const failures = ctx.events.filter(e =>
    e.eventType === 'login_failure' &&
    e.eventTimestamp >= fiveMinAgo &&
    e.identityId
  )

  const byIdentity = groupBy(failures, e => e.identityId!)
  const results: DetectionResult[] = []

  for (const [identityId, events] of byIdentity) {
    const uniqueIps = new Set(events.map(e => getParsedField(e, 'ipAddress')).filter(Boolean))
    if (events.length > 10 && uniqueIps.size > 1) {
      results.push({
        detected: true,
        threatType: 'credential_stuffing',
        severity: 'high',
        identityId,
        evidence: {
          eventIds: events.map(e => e.id),
          summary: `${events.length} failed logins from ${uniqueIps.size} IPs to single account in 5 minutes`,
          uniqueSourceIps: uniqueIps.size,
        },
        confidence: Math.min(95, 60 + events.length * 2),
        killChainPhase: 'credential_access',
        mitreTechniqueIds: ['T1110.001'],
        sourceIp: getParsedField(events[0], 'ipAddress'),
        sourceLocation: getParsedField(events[0], 'location'),
      })
    }
  }

  return results
}

// ── 3. MFA Fatigue — >3 MFA prompts with no approval in 5 min ──

async function mfaFatigueDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const mfaEvents = ctx.events.filter(e =>
    (e.eventType === 'mfa_prompt' || e.eventType === 'mfa_failure') &&
    e.eventTimestamp >= fiveMinAgo &&
    e.identityId
  )

  const mfaSuccesses = new Set(
    ctx.events
      .filter(e => e.eventType === 'mfa_success' && e.eventTimestamp >= fiveMinAgo)
      .map(e => e.identityId)
  )

  const byIdentity = groupBy(mfaEvents, e => e.identityId!)
  const results: DetectionResult[] = []

  for (const [identityId, events] of byIdentity) {
    if (events.length > 3 && !mfaSuccesses.has(identityId)) {
      results.push({
        detected: true,
        threatType: 'mfa_fatigue',
        severity: 'high',
        identityId,
        evidence: {
          eventIds: events.map(e => e.id),
          summary: `${events.length} MFA prompts with no successful approval in 5 minutes`,
          promptCount: events.length,
        },
        confidence: Math.min(90, 55 + events.length * 8),
        killChainPhase: 'credential_access',
        mitreTechniqueIds: ['T1621'],
        sourceIp: getParsedField(events[0], 'ipAddress'),
        sourceLocation: getParsedField(events[0], 'location'),
      })
    }
  }

  return results
}

// ── 4. Token Replay — Same session/token from 2+ IPs within 1 hour ──

async function tokenReplayDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const sessionEvents = ctx.events.filter(e =>
    e.eventTimestamp >= oneHourAgo &&
    getParsedField(e, 'sessionId') &&
    getParsedField(e, 'ipAddress')
  )

  const bySession = groupBy(sessionEvents, e => getParsedField(e, 'sessionId'))
  const results: DetectionResult[] = []

  for (const [sessionId, events] of bySession) {
    const uniqueIps = new Set(events.map(e => getParsedField(e, 'ipAddress')))
    if (uniqueIps.size >= 2) {
      const identityId = events.find(e => e.identityId)?.identityId
      if (!identityId) continue
      results.push({
        detected: true,
        threatType: 'token_replay',
        severity: 'critical',
        identityId,
        evidence: {
          eventIds: events.map(e => e.id),
          summary: `Session ${sessionId} used from ${uniqueIps.size} different IPs within 1 hour`,
          ips: Array.from(uniqueIps),
        },
        confidence: 85,
        killChainPhase: 'credential_access',
        mitreTechniqueIds: ['T1550'],
        sourceIp: Array.from(uniqueIps).join(', '),
      })
    }
  }

  return results
}

// ── 5. Impossible Travel — Auth from 2 locations >500km apart in <1 hour ──

async function impossibleTravelDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const loginEvents = ctx.events.filter(e =>
    (e.eventType === 'login_success' || e.eventType === 'session_start') &&
    e.eventTimestamp >= oneHourAgo &&
    e.identityId &&
    getParsedField(e, 'location')
  )

  const byIdentity = groupBy(loginEvents, e => e.identityId!)
  const results: DetectionResult[] = []

  for (const [identityId, events] of byIdentity) {
    if (events.length < 2) continue
    const sorted = events.sort((a, b) => a.eventTimestamp.getTime() - b.eventTimestamp.getTime())

    for (let i = 0; i < sorted.length - 1; i++) {
      const locA = getParsedField(sorted[i], 'location')
      const locB = getParsedField(sorted[i + 1], 'location')
      const latA = getParsedField(sorted[i], 'latitude')
      const lonA = getParsedField(sorted[i], 'longitude')
      const latB = getParsedField(sorted[i + 1], 'latitude')
      const lonB = getParsedField(sorted[i + 1], 'longitude')

      // If we have coordinates, calculate distance; otherwise flag if locations differ
      let isFlagged = false
      if (latA && lonA && latB && lonB) {
        const distance = haversineKm(latA, lonA, latB, lonB)
        isFlagged = distance > 500
      } else if (locA && locB && locA !== locB) {
        // Different named locations — flag as suspicious with lower confidence
        isFlagged = true
      }

      if (isFlagged) {
        results.push({
          detected: true,
          threatType: 'impossible_travel',
          severity: 'high',
          identityId,
          evidence: {
            eventIds: [sorted[i].id, sorted[i + 1].id],
            summary: `Authentication from ${locA} and ${locB} within ${Math.round((sorted[i + 1].eventTimestamp.getTime() - sorted[i].eventTimestamp.getTime()) / 60000)} minutes`,
            locations: [locA, locB],
          },
          confidence: latA ? 85 : 65,
          killChainPhase: 'initial_access',
          mitreTechniqueIds: ['T1078'],
          sourceLocation: `${locA} → ${locB}`,
        })
        break // only flag once per identity
      }
    }
  }

  return results
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── 6. Privilege Escalation — Non-admin adds self/is added to privileged group ──

async function privilegeEscalationDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
  const groupAdds = ctx.events.filter(e =>
    e.eventType === 'group_add' &&
    e.eventTimestamp >= tenMinAgo &&
    e.identityId
  )

  const results: DetectionResult[] = []

  for (const event of groupAdds) {
    const targetResource = getParsedField(event, 'targetResource') || ''
    const privilegedPatterns = [
      'domain admin', 'enterprise admin', 'schema admin',
      'global admin', 'privileged', 'tier 0', 'tier_0', 'top tier', 'tier_top',
      'account operator', 'backup operator',
    ]
    const isPrivilegedGroup = privilegedPatterns.some(p =>
      targetResource.toLowerCase().includes(p)
    )

    if (isPrivilegedGroup) {
      results.push({
        detected: true,
        threatType: 'privilege_escalation',
        severity: 'critical',
        identityId: event.identityId!,
        evidence: {
          eventIds: [event.id],
          summary: `Identity added to privileged group: ${targetResource}`,
          group: targetResource,
        },
        confidence: 90,
        killChainPhase: 'privilege_escalation',
        mitreTechniqueIds: ['T1098'],
        targetResource,
      })
    }
  }

  return results
}

// ── 7. Lateral Movement — Single identity auths to >5 different servers in 30 min ──

async function lateralMovementDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
  const authEvents = ctx.events.filter(e =>
    (e.eventType === 'login_success' || e.eventType === 'session_start') &&
    e.eventTimestamp >= thirtyMinAgo &&
    e.identityId &&
    getParsedField(e, 'targetResource')
  )

  const byIdentity = groupBy(authEvents, e => e.identityId!)
  const results: DetectionResult[] = []

  for (const [identityId, events] of byIdentity) {
    const uniqueTargets = new Set(events.map(e => getParsedField(e, 'targetResource')))
    if (uniqueTargets.size > 5) {
      results.push({
        detected: true,
        threatType: 'lateral_movement',
        severity: 'high',
        identityId,
        evidence: {
          eventIds: events.map(e => e.id),
          summary: `Authentication to ${uniqueTargets.size} different servers in 30 minutes`,
          targets: Array.from(uniqueTargets),
        },
        confidence: Math.min(90, 55 + uniqueTargets.size * 5),
        killChainPhase: 'lateral_movement',
        mitreTechniqueIds: ['T1021'],
        sourceIp: getParsedField(events[0], 'ipAddress'),
      })
    }
  }

  return results
}

// ── 8. Golden Ticket — Kerberos TGT with anomalous lifetime >10 hours ──

async function goldenTicketDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const tgsEvents = ctx.events.filter(e =>
    e.eventType === 'tgs_request' &&
    e.identityId
  )

  const results: DetectionResult[] = []

  for (const event of tgsEvents) {
    const ticketLifetime = getParsedField(event, 'ticketLifetimeHours')
    if (ticketLifetime && ticketLifetime > 10) {
      results.push({
        detected: true,
        threatType: 'golden_ticket',
        severity: 'critical',
        identityId: event.identityId!,
        evidence: {
          eventIds: [event.id],
          summary: `Kerberos TGT with anomalous lifetime of ${ticketLifetime} hours (normal: ≤10)`,
          ticketLifetimeHours: ticketLifetime,
        },
        confidence: 80,
        killChainPhase: 'persistence',
        mitreTechniqueIds: ['T1558.001'],
        sourceIp: getParsedField(event, 'ipAddress'),
      })
    }
  }

  return results
}

// ── 9. DCSync — Non-DC identity performing directory replication ──

async function dcsyncDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const replicationEvents = ctx.events.filter(e =>
    e.eventType === 'replication_request' &&
    e.identityId
  )

  if (replicationEvents.length === 0) return []

  // Load identities that triggered replication to check if they are DCs
  const identityIds = [...new Set(replicationEvents.map(e => e.identityId!).filter(Boolean))]
  if (identityIds.length === 0) return []

  const identityRows = await db
    .select({ id: identities.id, subType: identities.subType, displayName: identities.displayName })
    .from(identities)
    .where(inArray(identities.id, identityIds))

  const identityMap = new Map(identityRows.map(i => [i.id, i]))
  const results: DetectionResult[] = []

  for (const event of replicationEvents) {
    const identity = identityMap.get(event.identityId!)
    // Domain controllers are typically machine accounts — flag non-machine replication
    if (identity && identity.subType !== 'machine') {
      results.push({
        detected: true,
        threatType: 'dcsync',
        severity: 'critical',
        identityId: event.identityId!,
        evidence: {
          eventIds: [event.id],
          summary: `Non-DC identity "${identity.displayName}" performing directory replication (Event 4662 equivalent)`,
          identityType: identity.subType,
        },
        confidence: 95,
        killChainPhase: 'credential_access',
        mitreTechniqueIds: ['T1003.006'],
        sourceIp: getParsedField(event, 'ipAddress'),
      })
    }
  }

  return results
}

// ── 10. Service Account Abuse — Service account authenticating interactively or from unexpected IP ──

async function serviceAccountAbuseDetector(ctx: DetectionContext): Promise<DetectionResult[]> {
  const loginEvents = ctx.events.filter(e =>
    (e.eventType === 'login_success' || e.eventType === 'session_start') &&
    e.identityId
  )

  if (loginEvents.length === 0) return []

  const identityIds = [...new Set(loginEvents.map(e => e.identityId!).filter(Boolean))]
  if (identityIds.length === 0) return []

  const identityRows = await db
    .select({ id: identities.id, subType: identities.subType, displayName: identities.displayName })
    .from(identities)
    .where(and(
      inArray(identities.id, identityIds),
      eq(identities.subType, 'service_account'),
    ))

  const serviceAccountIds = new Set(identityRows.map(i => i.id))
  const identityMap = new Map(identityRows.map(i => [i.id, i]))
  const results: DetectionResult[] = []

  for (const event of loginEvents) {
    if (!serviceAccountIds.has(event.identityId!)) continue

    const identity = identityMap.get(event.identityId!)
    const authMethod = getParsedField(event, 'authMethod') || ''
    const isInteractive = authMethod === 'interactive' ||
      event.eventType === 'session_start' ||
      getParsedField(event, 'isInteractive')

    if (isInteractive) {
      results.push({
        detected: true,
        threatType: 'service_account_abuse',
        severity: 'high',
        identityId: event.identityId!,
        evidence: {
          eventIds: [event.id],
          summary: `Service account "${identity?.displayName}" used for interactive authentication`,
          authMethod,
        },
        confidence: 85,
        killChainPhase: 'initial_access',
        mitreTechniqueIds: ['T1078.002'],
        sourceIp: getParsedField(event, 'ipAddress'),
        sourceLocation: getParsedField(event, 'location'),
      })
    }
  }

  return results
}
