import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations, identityThreats, notifications } from '@/lib/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import { runDetectionRules } from '@/lib/itdr/detectors'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalDetections = 0
    let totalNotifications = 0

    for (const org of allOrgs) {
      // Run all detection rules for this org
      const results = await runDetectionRules(org.id)

      for (const result of results) {
        if (!result.detected) continue

        // Check for deduplication — don't create duplicate threats for same identity + type within 1 hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        const existing = await db
          .select({ id: identityThreats.id, lastSeenAt: identityThreats.lastSeenAt })
          .from(identityThreats)
          .where(and(
            eq(identityThreats.orgId, org.id),
            eq(identityThreats.identityId, result.identityId),
            eq(identityThreats.threatType, result.threatType as any),
            eq(identityThreats.status, 'active'),
            gte(identityThreats.lastSeenAt, oneHourAgo),
          ))
          .limit(1)

        if (existing.length > 0) {
          // Update lastSeenAt and merge evidence
          await db
            .update(identityThreats)
            .set({
              lastSeenAt: new Date(),
              evidence: result.evidence,
              confidence: Math.max(existing[0].lastSeenAt ? result.confidence : 0, result.confidence),
            })
            .where(eq(identityThreats.id, existing[0].id))
          continue
        }

        // Create new threat
        const now = new Date()
        const [threat] = await db.insert(identityThreats).values({
          threatType: result.threatType as any,
          severity: result.severity as any,
          status: 'active',
          identityId: result.identityId,
          killChainPhase: result.killChainPhase as any,
          evidence: result.evidence,
          sourceIp: result.sourceIp,
          sourceLocation: result.sourceLocation,
          targetResource: result.targetResource,
          mitreTechniqueIds: result.mitreTechniqueIds,
          confidence: result.confidence,
          firstSeenAt: now,
          lastSeenAt: now,
          orgId: org.id,
        }).returning()

        totalDetections++

        // Create notification for high/critical threats
        if (result.severity === 'critical' || result.severity === 'high') {
          await db.insert(notifications).values({
            orgId: org.id,
            userId: 'system',
            type: 'violation_detected',
            title: `${result.severity === 'critical' ? 'CRITICAL' : 'High'} Threat: ${result.threatType.replace(/_/g, ' ')}`,
            message: result.evidence?.summary || `Detected ${result.threatType} with ${result.confidence}% confidence`,
            severity: result.severity,
            link: `/dashboard/threats/${threat.id}`,
            metadata: { threatId: threat.id, threatType: result.threatType },
          })
          totalNotifications++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Detected ${totalDetections} new threats, sent ${totalNotifications} notifications`,
      detections: totalDetections,
      notifications: totalNotifications,
    })
  } catch (error) {
    console.error('Threat detector cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Threat detector failed', error: String(error) },
      { status: 500 }
    )
  }
}
