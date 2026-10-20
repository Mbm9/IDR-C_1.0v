import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import {
  integrationSources,
  identities,
  policyViolations,
  remediationPlans,
  users,
} from '@/lib/db/schema'
import { eq, and, count, ne } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.orgId
  const hasOrganization = !!orgId

  if (!orgId) {
    return NextResponse.json({
      hasOrganization: false,
      hasIntegration: false,
      hasIdentities: false,
      hasTierViolations: false,
      hasAIPlan: false,
      hasTeamMembers: false,
    })
  }

  const [
    integrationRows,
    identityRows,
    violationRows,
    planRows,
    userRows,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(integrationSources)
      .where(eq(integrationSources.orgId, orgId)),
    db
      .select({ count: count() })
      .from(identities)
      .where(eq(identities.orgId, orgId)),
    db
      .select({ count: count() })
      .from(policyViolations)
      .where(eq(policyViolations.orgId, orgId)),
    db
      .select({ count: count() })
      .from(remediationPlans)
      .where(eq(remediationPlans.orgId, orgId)),
    db
      .select({ count: count() })
      .from(users)
      .where(
        and(eq(users.orgId, orgId), ne(users.id, session.user.id))
      ),
  ])

  return NextResponse.json({
    hasOrganization,
    hasIntegration: Number(integrationRows[0]?.count ?? 0) > 0,
    hasIdentities: Number(identityRows[0]?.count ?? 0) > 0,
    hasTierViolations: Number(violationRows[0]?.count ?? 0) > 0,
    hasAIPlan: Number(planRows[0]?.count ?? 0) > 0,
    hasTeamMembers: Number(userRows[0]?.count ?? 0) > 0,
  })
}
