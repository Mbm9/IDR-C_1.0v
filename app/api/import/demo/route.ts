import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { db } from '@/lib/db'
import { identities, groups, groupMemberships, entitlements, resources, policyViolations, policies } from '@/lib/db/schema'
import { logAction } from '@/lib/actions/helpers'

// Realistic demo data generator for instant onboarding
const DEPARTMENTS = ['IT', 'Engineering', 'Finance', 'HR', 'Security', 'Operations', 'Legal', 'Marketing']
const FIRST_NAMES = ['Ahmad', 'Fatima', 'Omar', 'Sara', 'Khalid', 'Noura', 'Yusuf', 'Lina', 'Tariq', 'Huda', 'Faisal', 'Reem', 'Nasser', 'Maha', 'Hamad', 'Dalal']
const LAST_NAMES = ['Al-Rashid', 'Al-Qahtani', 'Al-Dosari', 'Al-Harbi', 'Al-Shehri', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Zahrani', 'Al-Malki', 'Al-Subaie']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo))
  return d
}

export async function POST(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
      return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
    }
    const orgId = session.user.orgId

    // Generate identities
    const demoIdentities: (typeof identities.$inferInsert)[] = []

    // Human identities (40)
    for (let i = 0; i < 40; i++) {
      const first = pick(FIRST_NAMES)
      const last = pick(LAST_NAMES)
      const dept = pick(DEPARTMENTS)
      const tier = i < 3 ? 'tier_0' : i < 10 ? 'tier_1' : 'tier_2'
      const tierViolation = i < 5 && tier === 'tier_2'

      demoIdentities.push({
        displayName: `${first} ${last}`,
        type: 'human',
        subType: i < 35 ? 'employee' : 'contractor',
        status: i < 38 ? 'active' : 'dormant',
        adTier: tier as any,
        effectiveTier: tierViolation ? 'tier_0' : tier as any,
        tierViolation,
        riskScore: tierViolation ? 70 + Math.floor(Math.random() * 30) : Math.floor(Math.random() * 50),
        sourceSystem: 'manual',
        sourceId: `demo-human-${i}`,
        upn: `${first.toLowerCase()}.${last.toLowerCase().replace('al-', '')}@demo.local`,
        samAccountName: `${first[0].toLowerCase()}${last.toLowerCase().replace('al-', '').slice(0, 8)}`,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace('al-', '')}@demo.local`,
        department: dept,
        lastLogonAt: i < 38 ? randomDate(30) : randomDate(180),
        passwordLastSetAt: randomDate(90),
        createdInSourceAt: randomDate(365),
        orgId,
      })
    }

    // NHI identities (10)
    const NHI_NAMES = ['svc-backup', 'svc-monitoring', 'app-crm-api', 'svc-deploy', 'bot-audit',
      'svc-mail-relay', 'app-erp-sync', 'svc-dns-update', 'svc-certificate', 'app-sso-proxy']
    for (let i = 0; i < 10; i++) {
      const tier = i < 2 ? 'tier_0' : i < 5 ? 'tier_1' : 'tier_2'
      demoIdentities.push({
        displayName: NHI_NAMES[i],
        type: 'non_human',
        subType: i < 6 ? 'service_account' : 'app_registration',
        status: i < 9 ? 'active' : 'orphaned',
        adTier: tier as any,
        riskScore: i === 9 ? 85 : Math.floor(Math.random() * 40),
        sourceSystem: 'manual',
        sourceId: `demo-nhi-${i}`,
        upn: `${NHI_NAMES[i]}@demo.local`,
        samAccountName: NHI_NAMES[i],
        createdInSourceAt: randomDate(365),
        lastLogonAt: i < 9 ? randomDate(14) : randomDate(200),
        orgId,
      })
    }

    // Insert identities
    const insertedIdentities = await db.insert(identities).values(demoIdentities).returning({ id: identities.id })
    const identityIds = insertedIdentities.map(i => i.id)

    // Generate groups (20)
    const GROUP_NAMES = [
      'Domain Admins', 'Enterprise Admins', 'Schema Admins', 'Server Operators',
      'Backup Operators', 'Account Operators', 'IT-Admins', 'Security-Team',
      'Finance-Users', 'HR-Users', 'Engineering-Dev', 'Engineering-QA',
      'VPN-Users', 'Remote-Desktop-Users', 'SQL-Admins', 'Azure-Contributors',
      'App-Developers', 'Help-Desk', 'Executives', 'All-Employees',
    ]
    const demoGroups: (typeof groups.$inferInsert)[] = GROUP_NAMES.map((name, i) => ({
      name,
      type: i < 6 ? 'privileged_access' : 'security' as any,
      scope: 'global' as any,
      adTier: i < 3 ? 'tier_0' : i < 8 ? 'tier_1' : 'tier_2' as any,
      sourceSystem: 'manual' as any,
      sourceId: `demo-group-${i}`,
      memberCount: Math.floor(Math.random() * 20) + 2,
      nestedGroupCount: 0,
      isPrivileged: i < 6,
      orgId,
    }))

    const insertedGroups = await db.insert(groups).values(demoGroups).returning({ id: groups.id })

    // Generate resources (10)
    const RESOURCE_NAMES = [
      'DC01', 'DC02', 'APP-Server-01', 'SQL-Server-01', 'File-Server-01',
      'Web-Server-01', 'Mail-Server-01', 'CRM Application', 'ERP System', 'HR Portal',
    ]
    const demoResources: (typeof resources.$inferInsert)[] = RESOURCE_NAMES.map((name, i) => ({
      name,
      type: i < 2 ? 'domain_controller' : i < 7 ? 'server' : 'application' as any,
      adTier: i < 2 ? 'tier_0' : i < 7 ? 'tier_1' : 'tier_2' as any,
      criticality: i < 2 ? 'critical' : i < 5 ? 'high' : 'medium' as any,
      environment: 'production' as any,
      orgId,
    }))
    const insertedResources = await db.insert(resources).values(demoResources).returning({ id: resources.id })
    const resourceIds = insertedResources.map(r => r.id)

    // Generate entitlements (100)
    const PERMISSION_NAMES = [
      'Full Control', 'Read', 'Write', 'Modify', 'Domain Admin', 'Local Admin',
      'Backup Operator', 'Account Operator', 'Schema Admin', 'Enterprise Admin',
      'Contributor', 'Reader', 'Owner', 'User Access Admin', 'SQL db_owner',
    ]
    const demoEntitlements: (typeof entitlements.$inferInsert)[] = []
    for (let i = 0; i < 100; i++) {
      const identityId = identityIds[Math.floor(Math.random() * identityIds.length)]
      const resourceId = resourceIds[Math.floor(Math.random() * resourceIds.length)]
      const permName = pick(PERMISSION_NAMES)
      const permTier = i < 10 ? 'tier_0' : i < 30 ? 'tier_1' : 'tier_2'

      demoEntitlements.push({
        identityId,
        resourceId,
        permissionType: pick(['role', 'group_membership', 'direct_assignment'] as const) as any,
        permissionName: permName,
        permissionScope: 'OU=Demo,DC=demo,DC=local',
        adTierOfPermission: permTier as any,
        grantedAt: randomDate(365),
        grantedBy: 'system',
        lastUsedAt: randomDate(90),
        certifiable: true,
        certificationStatus: pick(['pending', 'certified', 'expired'] as const) as any,
        riskTags: i < 5 ? ['excessive_privilege'] : [],
        orgId,
      })
    }
    await db.insert(entitlements).values(demoEntitlements)

    // Generate a policy for violations
    const [policy] = await db.insert(policies).values({
      name: 'Default Tiering Policy',
      type: 'tiering_rule',
      definition: { rule: 'no_cross_tier_access' },
      severity: 'critical',
      enabled: true,
      frameworkMappings: { NCA_ECC: ['AC-1'], SAMA_CSF: ['IAM-2'] },
      orgId,
    }).returning({ id: policies.id })

    // Generate violations (10)
    const VIOLATION_TYPES = ['tier_breach', 'excessive_privilege', 'dormant_access', 'orphaned_identity', 'missing_mfa'] as const
    const demoViolations: (typeof policyViolations.$inferInsert)[] = []
    for (let i = 0; i < 10; i++) {
      demoViolations.push({
        policyId: policy.id,
        identityId: identityIds[i % identityIds.length],
        violationType: VIOLATION_TYPES[i % VIOLATION_TYPES.length] as any,
        severity: i < 3 ? 'critical' : i < 6 ? 'high' : 'medium' as any,
        status: 'open',
        detectedAt: randomDate(30),
        orgId,
      })
    }
    await db.insert(policyViolations).values(demoViolations)

    const summary = {
      identities: demoIdentities.length,
      groups: demoGroups.length,
      resources: RESOURCE_NAMES.length,
      entitlements: demoEntitlements.length,
      violations: demoViolations.length,
    }

    await logAction({
      actionType: 'import_data',
      actorIdentityId: session.user.id,
      orgId,
      payload: { operation: 'demo_data', policyId: policy.id, ...summary },
    })

    return NextResponse.json({ success: true, summary })
  } catch (err: any) {
    console.error('[Demo] Error:', err)
    return NextResponse.json({ error: 'Failed to generate demo data', details: err.message }, { status: 500 })
  }
}
