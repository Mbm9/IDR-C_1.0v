import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from '../lib/db/schema'
import bcrypt from 'bcryptjs'
import { isControlPlaneTier, isStricterTier, stricterTier, type AdTier } from '../lib/utils/tiers'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/identity_radar'
const client = postgres(DATABASE_URL)
const db = drizzle(client, { schema })

// --- userAccountControl flags (for AD security posture seeding) ---
const UAC_NORMAL = 0x0200
const UAC_PASSWD_NOTREQD = 0x0020
const UAC_REVERSIBLE_ENCRYPTION = 0x0080
const UAC_DONT_EXPIRE_PASSWORD = 0x10000
const UAC_TRUSTED_FOR_DELEGATION = 0x80000
const UAC_DONT_REQ_PREAUTH = 0x400000

// --- Helpers ---
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function randomDate(startDaysAgo: number, endDaysAgo: number): Date {
  return daysAgo(randomInt(endDaysAgo, startDaysAgo))
}

// --- Name generators ---
const ARABIC_FIRST_NAMES = [
  'Mohammed', 'Ahmed', 'Ali', 'Omar', 'Khalid', 'Fahad', 'Sultan', 'Abdulaziz',
  'Nasser', 'Ibrahim', 'Youssef', 'Hassan', 'Tariq', 'Saad', 'Hamad', 'Faisal',
  'Majed', 'Saud', 'Bandar', 'Abdullah', 'Fatima', 'Noura', 'Sara', 'Maha',
  'Reem', 'Huda', 'Layla', 'Amira', 'Dalal', 'Nada',
]
const ARABIC_LAST_NAMES = [
  'Al-Rashidi', 'Al-Harbi', 'Al-Otaibi', 'Al-Shammari', 'Al-Qahtani',
  'Al-Dosari', 'Al-Mutairi', 'Al-Zahrani', 'Al-Ghamdi', 'Al-Shahrani',
  'Al-Subaie', 'Al-Juhani', 'Al-Anazi', 'Al-Yami', 'Al-Malki',
]
const DEPARTMENTS = [
  'Information Technology', 'Security Operations', 'Finance', 'Human Resources',
  'Legal', 'Engineering', 'Operations', 'Executive', 'Compliance', 'Audit',
]

function randomName(): string {
  return `${randomItem(ARABIC_FIRST_NAMES)} ${randomItem(ARABIC_LAST_NAMES)}`
}

// --- Service account name generators ---
const SVC_PREFIXES = ['svc', 'app', 'bot', 'api', 'sys', 'msi']
const SVC_SYSTEMS = [
  'erp', 'crm', 'hrms', 'ldap', 'backup', 'monitoring', 'scanner',
  'deploy', 'jenkins', 'terraform', 'grafana', 'splunk', 'vault',
  'exchange', 'sharepoint', 'teams', 'intune', 'sccm', 'wsus',
]

function randomSvcName(): string {
  return `${randomItem(SVC_PREFIXES)}-${randomItem(SVC_SYSTEMS)}-${randomInt(1, 99).toString().padStart(2, '0')}`
}

// --- Top Tier (Tier 0 adjacent: ADFS, Entra Connect, PKI, PAM vault, DC backup) ---
// Kept in sync with scripts/apply-top-tier-demo.ts, which applies the same
// classification to an existing demo database.
const TOP_TIER_RESOURCES = new Set(['SRV-ADFS-01', 'SRV-AADConnect', 'SRV-PKI-01', 'SRV-BACKUP-01', 'CyberArk-PAM', 'AZ-KEYVAULT-01'])
const TOP_TIER_GROUPS = new Set(['Backup Operators', 'AZ-KeyVault-Admins'])
// Service accounts by index in the service-account loop (SVC-0006, SVC-0007)
const TOP_TIER_SVC_NAMES: Record<number, string> = { 5: 'svc-backup', 6: 'svc-adconnect' }

// --- Main seed ---
async function seed() {
  console.log('Seeding database...')

  // 1. Organization
  const [org] = await db.insert(schema.organizations).values({
    name: 'Acme Financial Services',
    domain: 'acmefs.sa',
    industry: 'Financial Services',
    regulatoryFrameworks: ['NCA_ECC', 'SAMA_CSF', 'PDPL'],
    adForestName: 'acmefs.local',
    tenantId: 'acmefs-tenant-001',
  }).returning()
  console.log(`Created org: ${org.id}`)

  // 2. Admin user for NextAuth
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123'
  const hashedPassword = await bcrypt.hash(seedPassword, 10)
  await db.insert(schema.users).values({
    name: 'Admin User',
    email: 'admin@acmefs.sa',
    hashedPassword,
    appRole: 'admin',
    orgId: org.id,
  })
  console.log('Created admin user: admin@acmefs.sa (password set via SEED_ADMIN_PASSWORD env var)')

  // 2b. Subscription — the demo org is on the enterprise tier so API keys
  // (apiAccess), invitations and integrations can be demonstrated. Orgs created
  // through onboarding still start on the free tier and stay gated.
  await db.insert(schema.subscriptions).values({
    orgId: org.id,
    tier: 'enterprise',
    maxIdentities: 100_000,
    maxIntegrations: 50,
    maxUsers: 100,
    maxAiRunsPerMonth: 1_000,
    retentionDays: 365,
    apiAccess: true,
    ssoEnabled: true,
  })
  console.log('Created enterprise subscription for demo org (API access enabled)')

  // 3. Identities (200 total: 140 human + 60 NHI)
  const identityValues: (typeof schema.identities.$inferInsert)[] = []

  // 100 employees
  for (let i = 0; i < 100; i++) {
    const name = randomName()
    const firstName = name.split(' ')[0].toLowerCase()
    const lastName = name.split(' ')[1]?.toLowerCase().replace('al-', '') || 'user'
    const dormant = i < 10 // first 10 are dormant
    identityValues.push({
      displayName: name,
      type: 'human',
      subType: 'employee',
      status: dormant ? 'dormant' : 'active',
      // EMP-0006..EMP-0011 are the Top Tier admins (PKI, ADFS, Entra Connect, backup, PAM vault)
      adTier: i < 5 ? 'tier_0' : i < 11 ? 'tier_top' : i < 20 ? 'tier_1' : 'tier_2',
      riskScore: dormant ? randomInt(40, 70) : randomInt(0, 50),
      sourceSystem: 'active_directory',
      sourceId: `EMP-${(i + 1).toString().padStart(4, '0')}`,
      upn: `${firstName}.${lastName}@acmefs.sa`,
      samAccountName: `${firstName}.${lastName}`,
      email: `${firstName}.${lastName}@acmefs.sa`,
      department: randomItem(DEPARTMENTS),
      lastLogonAt: dormant ? daysAgo(randomInt(91, 365)) : daysAgo(randomInt(0, 30)),
      passwordLastSetAt: daysAgo(randomInt(1, 180)),
      createdInSourceAt: daysAgo(randomInt(100, 1000)),
      adSecurity: (() => {
        let uac = UAC_NORMAL
        if (i < 5) {} // tier_0 admins (adminCount set below)
        if (i === 2) uac |= UAC_DONT_REQ_PREAUTH   // AS-REP roastable tier_0 admin
        if (i === 3) uac |= UAC_PASSWD_NOTREQD      // password not required on tier_0
        if (i === 6) uac |= UAC_DONT_EXPIRE_PASSWORD
        if (i === 7) uac |= UAC_REVERSIBLE_ENCRYPTION
        return { uac, spn: [], adminCount: i < 5 ? 1 : 0, allowedToDelegateTo: [], rbcd: false }
      })(),
      orgId: org.id,
    })
  }

  // 20 contractors
  for (let i = 0; i < 20; i++) {
    const name = randomName()
    const firstName = name.split(' ')[0].toLowerCase()
    identityValues.push({
      displayName: name,
      type: 'human',
      subType: 'contractor',
      status: i < 3 ? 'inactive' : 'active',
      adTier: 'tier_2',
      riskScore: randomInt(10, 40),
      sourceSystem: 'azure_ad',
      sourceId: `CTR-${(i + 1).toString().padStart(4, '0')}`,
      upn: `${firstName}.contractor@acmefs.sa`,
      samAccountName: `c.${firstName}`,
      email: `${firstName}@contractor-firm.com`,
      department: randomItem(['Engineering', 'Operations', 'Information Technology']),
      lastLogonAt: daysAgo(randomInt(0, 60)),
      createdInSourceAt: daysAgo(randomInt(30, 365)),
      orgId: org.id,
    })
  }

  // 20 vendors
  for (let i = 0; i < 20; i++) {
    const name = randomName()
    identityValues.push({
      displayName: name,
      type: 'human',
      subType: 'vendor',
      status: i < 2 ? 'suspended' : 'active',
      adTier: 'tier_2',
      riskScore: randomInt(5, 30),
      sourceSystem: 'okta',
      sourceId: `VND-${(i + 1).toString().padStart(4, '0')}`,
      upn: `vendor${i + 1}@partner.com`,
      email: `vendor${i + 1}@partner.com`,
      lastLogonAt: daysAgo(randomInt(0, 90)),
      createdInSourceAt: daysAgo(randomInt(60, 500)),
      orgId: org.id,
    })
  }

  // 25 service accounts
  for (let i = 0; i < 25; i++) {
    const svcName = TOP_TIER_SVC_NAMES[i] ?? randomSvcName()
    const orphaned = i < 5
    identityValues.push({
      displayName: svcName,
      type: 'non_human',
      subType: 'service_account',
      status: orphaned ? 'orphaned' : 'active',
      adTier: i < 3 ? 'tier_0' : TOP_TIER_SVC_NAMES[i] ? 'tier_top' : i < 10 ? 'tier_1' : 'tier_2',
      riskScore: orphaned ? randomInt(60, 90) : randomInt(10, 50),
      sourceSystem: 'active_directory',
      sourceId: `SVC-${(i + 1).toString().padStart(4, '0')}`,
      samAccountName: svcName,
      lastLogonAt: daysAgo(randomInt(0, 60)),
      passwordLastSetAt: daysAgo(randomInt(400, 1200)), // stale → raises Kerberoast severity
      createdInSourceAt: daysAgo(randomInt(100, 800)),
      expiryAt: i < 8 ? daysAgo(-randomInt(30, 365)) : daysAgo(randomInt(-365, -1)),
      adSecurity: (() => {
        const svcClass = randomItem(['MSSQLSvc', 'HTTP', 'HOST', 'CIFS', 'LDAP'])
        let uac = UAC_NORMAL
        if (i === 11) uac |= UAC_TRUSTED_FOR_DELEGATION // unconstrained delegation → critical
        return {
          uac,
          spn: [`${svcClass}/host${i + 1}.acmefs.local:1433`], // all service accounts are Kerberoastable
          adminCount: i < 3 ? 1 : 0,
          allowedToDelegateTo: i === 12 ? ['CIFS/fileserver.acmefs.local'] : [], // constrained delegation
          rbcd: i === 13, // resource-based constrained delegation
        }
      })(),
      orgId: org.id,
    })
  }

  // 15 managed identities
  for (let i = 0; i < 15; i++) {
    identityValues.push({
      displayName: `msi-${randomItem(SVC_SYSTEMS)}-${randomInt(1, 20)}`,
      type: 'non_human',
      subType: 'managed_identity',
      status: 'active',
      adTier: i < 2 ? 'tier_0' : 'tier_1',
      riskScore: randomInt(5, 35),
      sourceSystem: 'azure_ad',
      sourceId: `MSI-${(i + 1).toString().padStart(4, '0')}`,
      lastLogonAt: daysAgo(randomInt(0, 14)),
      createdInSourceAt: daysAgo(randomInt(30, 400)),
      orgId: org.id,
    })
  }

  // 10 app registrations
  for (let i = 0; i < 10; i++) {
    identityValues.push({
      displayName: `app-${randomItem(SVC_SYSTEMS)}-${randomItem(['prod', 'dev', 'staging'])}`,
      type: 'non_human',
      subType: 'app_registration',
      status: 'active',
      adTier: 'tier_1',
      riskScore: randomInt(10, 40),
      sourceSystem: 'azure_ad',
      sourceId: `APP-${(i + 1).toString().padStart(4, '0')}`,
      lastLogonAt: daysAgo(randomInt(0, 30)),
      createdInSourceAt: daysAgo(randomInt(60, 600)),
      expiryAt: daysAgo(-randomInt(30, 365)),
      orgId: org.id,
    })
  }

  // 5 API keys, 3 bots, 2 machines
  const nhiBatch: typeof identityValues = []
  for (let i = 0; i < 5; i++) {
    nhiBatch.push({
      displayName: `apikey-${randomItem(SVC_SYSTEMS)}-${i + 1}`,
      type: 'non_human', subType: 'api_key', status: 'active',
      adTier: 'tier_2', riskScore: randomInt(5, 25),
      sourceSystem: 'manual', sourceId: `KEY-${i + 1}`,
      createdInSourceAt: daysAgo(randomInt(30, 300)),
      expiryAt: daysAgo(-randomInt(10, 180)),
      orgId: org.id,
    })
  }
  for (let i = 0; i < 3; i++) {
    nhiBatch.push({
      displayName: `bot-${randomItem(['helpdesk', 'alerts', 'scheduler'])}-${i + 1}`,
      type: 'non_human', subType: 'bot', status: 'active',
      adTier: 'tier_2', riskScore: randomInt(5, 20),
      sourceSystem: 'azure_ad', sourceId: `BOT-${i + 1}`,
      lastLogonAt: daysAgo(randomInt(0, 7)),
      createdInSourceAt: daysAgo(randomInt(60, 400)),
      orgId: org.id,
    })
  }
  for (let i = 0; i < 2; i++) {
    nhiBatch.push({
      displayName: `machine-dc${i + 1}.acmefs.local`,
      type: 'non_human', subType: 'machine', status: 'active',
      adTier: 'tier_0', riskScore: randomInt(15, 40),
      sourceSystem: 'active_directory', sourceId: `MCH-${i + 1}`,
      lastLogonAt: daysAgo(0),
      createdInSourceAt: daysAgo(randomInt(500, 1500)),
      // Domain controllers are trusted for delegation — surfaced as an unconstrained-delegation exposure
      adSecurity: { uac: UAC_NORMAL | UAC_TRUSTED_FOR_DELEGATION, spn: [], adminCount: 1, allowedToDelegateTo: [], rbcd: false },
      orgId: org.id,
    })
  }
  identityValues.push(...nhiBatch)

  // Insert all identities
  const allIdentities = await db.insert(schema.identities).values(identityValues).returning()
  console.log(`Created ${allIdentities.length} identities`)

  // Set owner for NHIs (first 5 orphaned have no owner, rest get random human owners)
  const humanIds = allIdentities.filter(i => i.type === 'human').map(i => i.id)
  const nhiIds = allIdentities.filter(i => i.type === 'non_human')
  for (const nhi of nhiIds) {
    if (nhi.status !== 'orphaned' && Math.random() > 0.2) {
      await db.update(schema.identities)
        .set({ ownerIdentityId: randomItem(humanIds) })
        .where(eq(schema.identities.id, nhi.id))
    }
  }

  // Set managers for some humans
  const managerCandidates = allIdentities.filter(i => i.type === 'human' && i.adTier !== 'tier_2').map(i => i.id)
  for (const identity of allIdentities.filter(i => i.type === 'human' && i.adTier === 'tier_2')) {
    if (managerCandidates.length > 0 && Math.random() > 0.3) {
      await db.update(schema.identities)
        .set({ managerIdentityId: randomItem(managerCandidates) })
        .where(eq(schema.identities.id, identity.id))
    }
  }

  // 3b. Seed data quality scores
  for (const identity of allIdentities) {
    const hasEmail = !!identity.email
    const hasDept = !!identity.department
    const hasManager = !!identity.managerIdentityId
    const hasOwner = !!identity.ownerIdentityId
    const hasTier = identity.adTier !== 'unclassified'
    const hasLogon = !!identity.lastLogonAt
    const isNhi = identity.type === 'non_human'

    // Filled field count determines base completeness
    const fields = [hasEmail, hasDept, !isNhi || hasOwner, hasTier, hasLogon, !isNhi || !!identity.expiryAt]
    const filledCount = fields.filter(Boolean).length
    const completeness = Math.round((filledCount / fields.length) * 100)

    // Score based on identity type and source
    let score: number
    if (['active_directory', 'azure_ad'].includes(identity.sourceSystem) && identity.type === 'human') {
      score = randomInt(75, 95) // Well-known sources with many fields
    } else if (isNhi && filledCount <= 3) {
      score = randomInt(30, 60) // Sparse NHIs
    } else {
      score = randomInt(50, 75) // Middle ground
    }

    const freshness = hasLogon ? randomInt(70, 100) : randomInt(20, 50)
    const accuracy = hasTier && hasEmail ? randomInt(70, 95) : randomInt(40, 65)

    const fieldsMeta: Record<string, any> = {}
    if (hasEmail) fieldsMeta.email = { filled: true, source: identity.sourceSystem, confidence: randomInt(85, 100), lastUpdated: new Date().toISOString() }
    if (hasDept) fieldsMeta.department = { filled: true, source: identity.sourceSystem, confidence: randomInt(75, 95), lastUpdated: new Date().toISOString() }
    if (hasTier) fieldsMeta.adTier = { filled: true, source: identity.sourceSystem, confidence: randomInt(70, 100), lastUpdated: new Date().toISOString() }
    if (hasLogon) fieldsMeta.lastLogonAt = { filled: true, source: identity.sourceSystem, confidence: 100, lastUpdated: new Date().toISOString() }

    await db.update(schema.identities)
      .set({
        dataQuality: { score, completeness, freshness, accuracy, fields: fieldsMeta },
      })
      .where(eq(schema.identities.id, identity.id))
  }
  console.log(`Seeded data quality scores for ${allIdentities.length} identities`)

  // 4. Accounts (1-3 per identity)
  const accountValues: (typeof schema.accounts.$inferInsert)[] = []
  for (const identity of allIdentities) {
    const numAccounts = identity.type === 'human' ? randomInt(1, 3) : 1
    const platforms: (typeof schema.platformEnum.enumValues)[number][] =
      identity.type === 'human'
        ? ['ad', 'azure_ad', 'okta'].slice(0, numAccounts) as any
        : [identity.sourceSystem === 'azure_ad' ? 'azure_ad' : 'ad'] as any

    for (let j = 0; j < numAccounts; j++) {
      accountValues.push({
        identityId: identity.id,
        platform: platforms[j] || 'ad',
        accountName: identity.samAccountName || identity.displayName,
        accountType: isControlPlaneTier(identity.adTier) ? 'admin'
          : identity.adTier === 'tier_1' ? 'privileged'
          : identity.type === 'non_human' ? 'service'
          : 'standard',
        enabled: identity.status === 'active' || identity.status === 'dormant',
        lastAuthenticatedAt: identity.lastLogonAt,
        mfaEnabled: identity.type === 'human' && Math.random() > 0.15,
        mfaMethods: identity.type === 'human' && Math.random() > 0.15
          ? [randomItem(['authenticator', 'sms', 'email', 'fido2'])]
          : [],
        privileged: isControlPlaneTier(identity.adTier) || identity.adTier === 'tier_1',
        orgId: org.id,
      })
    }
  }
  const allAccounts = await db.insert(schema.accounts).values(accountValues).returning()
  console.log(`Created ${allAccounts.length} accounts`)

  // 5. Resources (100)
  const resourceTypes: (typeof schema.resourceTypeEnum.enumValues)[number][] = [
    'domain_controller', 'domain_controller', 'domain_controller',
    'server', 'server', 'server', 'server', 'server', 'server', 'server',
    'server', 'server', 'server', 'server', 'server', 'server', 'server',
    'application', 'application', 'application', 'application', 'application',
    'application', 'application', 'application', 'application', 'application',
    'database', 'database', 'database', 'database', 'database',
    'database', 'database', 'database', 'database', 'database',
    'file_share', 'file_share', 'file_share', 'file_share', 'file_share',
    'cloud_resource', 'cloud_resource', 'cloud_resource', 'cloud_resource',
    'cloud_resource', 'cloud_resource', 'cloud_resource', 'cloud_resource',
    'workstation', 'workstation', 'workstation', 'workstation', 'workstation',
    'workstation', 'workstation', 'workstation', 'workstation', 'workstation',
    'network_device', 'network_device', 'network_device', 'network_device',
    'saas_app', 'saas_app', 'saas_app', 'saas_app', 'saas_app',
    'saas_app', 'saas_app', 'saas_app', 'saas_app', 'saas_app',
  ]
  const resourceNames: Record<string, string[]> = {
    domain_controller: ['DC-PRIMARY', 'DC-SECONDARY', 'DC-DR'],
    server: ['SRV-APP-01', 'SRV-APP-02', 'SRV-WEB-01', 'SRV-WEB-02', 'SRV-DB-01',
      'SRV-FILE-01', 'SRV-EXCH-01', 'SRV-SCCM-01', 'SRV-WSUS-01', 'SRV-PRINT-01',
      'SRV-ADFS-01', 'SRV-AADConnect', 'SRV-PKI-01', 'SRV-RADIUS-01', 'SRV-NPS-01',
      'SRV-BACKUP-01', 'SRV-MON-01'],
    application: ['ERP-SAP', 'CRM-Dynamics', 'HR-SuccessFactors', 'ServiceNow', 'Jira',
      'Confluence', 'GitLab', 'Jenkins', 'SonarQube', 'Artifactory'],
    database: ['DB-ERP-PROD', 'DB-CRM-PROD', 'DB-HR-PROD', 'DB-FINANCE', 'DB-AUDIT',
      'DB-LOGS', 'DB-ANALYTICS', 'DB-APP-01', 'DB-APP-02', 'DB-STAGING'],
    file_share: ['FS-DEPT', 'FS-SHARED', 'FS-FINANCE', 'FS-LEGAL', 'FS-EXEC'],
    cloud_resource: ['AZ-VNET-PROD', 'AZ-KEYVAULT-01', 'AZ-STORAGE-01', 'AZ-AKS-PROD',
      'AZ-APIM-01', 'AZ-FUNC-01', 'AZ-SQL-01', 'AZ-COSMOSDB-01'],
    workstation: Array.from({ length: 10 }, (_, i) => `WS-${(i + 1).toString().padStart(3, '0')}`),
    network_device: ['FW-CORE-01', 'FW-DMZ-01', 'SW-CORE-01', 'VPN-GW-01'],
    saas_app: ['M365', 'Salesforce', 'Slack', 'Zoom', 'Box', 'Okta-SSO', 'CyberArk-PAM',
      'SailPoint-IIQ', 'Splunk-Cloud', 'Datadog'],
  }

  const resourceValues: (typeof schema.resources.$inferInsert)[] = []
  const usedNames = new Set<string>()
  for (let i = 0; i < 100; i++) {
    const rType = resourceTypes[i] || 'server'
    const names = resourceNames[rType] || [`RES-${i}`]
    const baseName = names[i % names.length] || `RES-${rType}-${i}`
    let name = baseName
    if (usedNames.has(name)) name = `${name}-${i}`
    usedNames.add(name)

    const tier: (typeof schema.adTierEnum.enumValues)[number] =
      rType === 'domain_controller' ? 'tier_0'
      : TOP_TIER_RESOURCES.has(baseName) ? 'tier_top'
      : ['server', 'application', 'database'].includes(rType) ? 'tier_1'
      : 'tier_2'

    resourceValues.push({
      name,
      type: rType,
      adTier: tier,
      criticality: isControlPlaneTier(tier) ? 'critical' : tier === 'tier_1' ? 'high' : 'medium',
      environment: Math.random() > 0.15 ? 'production' : randomItem(['staging', 'development', 'dr']),
      ownerIdentityId: Math.random() > 0.3 ? randomItem(humanIds) : undefined,
      orgId: org.id,
    })
  }
  const allResources = await db.insert(schema.resources).values(resourceValues).returning()
  console.log(`Created ${allResources.length} resources`)

  // 6. Groups (50)
  const groupValues: (typeof schema.groups.$inferInsert)[] = []
  const privilegedGroupNames = [
    'Domain Admins', 'Enterprise Admins', 'Schema Admins', 'Administrators',
    'Account Operators', 'Server Operators', 'Backup Operators',
  ]
  const securityGroupNames = [
    'IT-Department', 'HR-Department', 'Finance-Department', 'Legal-Department',
    'Engineering', 'Operations', 'Compliance', 'Audit', 'Executive-Staff',
    'All-Employees', 'Contractors-Group', 'Vendors-Group',
  ]
  const appGroupNames = [
    'APP-ERP-Users', 'APP-ERP-Admins', 'APP-CRM-Users', 'APP-CRM-Admins',
    'APP-HR-Users', 'APP-ServiceNow-Users', 'APP-Jira-Users',
    'APP-GitLab-Developers', 'APP-Jenkins-Admins',
  ]
  const azureGroupNames = [
    'AZ-Subscription-Owners', 'AZ-Subscription-Contributors',
    'AZ-Subscription-Readers', 'AZ-KeyVault-Admins',
    'AZ-Storage-Contributors', 'AZ-SQL-Admins',
  ]
  const allGroupNames = [
    ...privilegedGroupNames.map(n => ({ name: n, type: 'privileged_access' as const, tier: 'tier_0' as const, priv: true })),
    ...securityGroupNames.map(n => ({ name: n, type: 'security' as const, tier: 'tier_2' as const, priv: false })),
    ...appGroupNames.map(n => ({ name: n, type: 'role_based' as const, tier: 'tier_1' as const, priv: n.includes('Admin') })),
    ...azureGroupNames.map(n => ({ name: n, type: 'security' as const, tier: n.includes('Owner') || n.includes('Admin') ? 'tier_0' as const : 'tier_1' as const, priv: n.includes('Owner') || n.includes('Admin') })),
  ]

  for (let i = 0; i < Math.min(50, allGroupNames.length); i++) {
    const g = allGroupNames[i]
    groupValues.push({
      name: g.name,
      type: g.type,
      scope: 'global',
      adTier: TOP_TIER_GROUPS.has(g.name) ? 'tier_top' : g.tier,
      sourceSystem: g.name.startsWith('AZ-') ? 'azure_ad' : 'active_directory',
      sourceId: `GRP-${(i + 1).toString().padStart(4, '0')}`,
      memberCount: 0,
      nestedGroupCount: 0,
      isPrivileged: g.priv,
      ownerIdentityId: randomItem(humanIds),
      orgId: org.id,
    })
  }
  // Fill to 50 if needed
  while (groupValues.length < 50) {
    const idx = groupValues.length
    groupValues.push({
      name: `GRP-Custom-${idx}`,
      type: 'security',
      scope: 'domain_local',
      adTier: 'tier_2',
      sourceSystem: 'active_directory',
      sourceId: `GRP-${(idx + 1).toString().padStart(4, '0')}`,
      memberCount: 0,
      nestedGroupCount: 0,
      isPrivileged: false,
      ownerIdentityId: randomItem(humanIds),
      orgId: org.id,
    })
  }
  const allGroups = await db.insert(schema.groups).values(groupValues).returning()
  console.log(`Created ${allGroups.length} groups`)

  // 7. Group memberships (~300)
  const membershipValues: (typeof schema.groupMemberships.$inferInsert)[] = []
  const membershipSet = new Set<string>()
  for (const group of allGroups) {
    const numMembers = group.isPrivileged ? randomInt(2, 8) : randomInt(5, 20)
    for (let j = 0; j < numMembers; j++) {
      const identityId = randomItem(allIdentities.map(i => i.id))
      const key = `${group.id}-${identityId}`
      if (membershipSet.has(key)) continue
      membershipSet.add(key)
      membershipValues.push({
        groupId: group.id,
        identityId,
        membershipType: Math.random() > 0.8 ? 'nested' : 'direct',
        addedBy: 'system',
        orgId: org.id,
      })
    }
  }
  await db.insert(schema.groupMemberships).values(membershipValues)
  console.log(`Created ${membershipValues.length} group memberships`)

  // Update member counts
  for (const group of allGroups) {
    const count = membershipValues.filter(m => m.groupId === group.id).length
    await db.update(schema.groups)
      .set({ memberCount: count })
      .where(eq(schema.groups.id, group.id))
  }

  // 8. Entitlements (500)
  const permissionNames: Record<string, string[]> = {
    tier_0: ['Domain Admin', 'Enterprise Admin', 'Schema Admin', 'Global Admin',
      'Privileged Authentication Admin', 'Exchange Admin', 'Security Admin'],
    tier_top: ['ADFS Administrator', 'PKI Administrator', 'Entra Connect Admin',
      'Backup Operator', 'PAM Vault Admin', 'Key Vault Admin'],
    tier_1: ['Server Operator', 'Application Admin',
      'SQL Admin', 'Storage Blob Contributor', 'Virtual Machine Contributor',
      'Reader', 'Contributor'],
    tier_2: ['User', 'Reader', 'Help Desk Operator', 'Print Operator',
      'Basic User', 'Standard User', 'Guest'],
  }

  const entitlementValues: (typeof schema.entitlements.$inferInsert)[] = []
  for (let i = 0; i < 500; i++) {
    const identity = randomItem(allIdentities)
    const resource = randomItem(allResources)
    const tier = resource.adTier || 'tier_2'
    const tierKey = tier === 'unclassified' ? 'tier_2' : tier
    const isTierViolation = isStricterTier(tier, identity.adTier)

    entitlementValues.push({
      identityId: identity.id,
      resourceId: resource.id,
      permissionType: randomItem(['role', 'group_membership', 'direct_assignment', 'inherited', 'delegated'] as const),
      permissionName: randomItem(permissionNames[tierKey] || permissionNames.tier_2),
      permissionScope: resource.name,
      adTierOfPermission: tier,
      grantedAt: randomDate(365, 1),
      grantedBy: 'system',
      lastUsedAt: Math.random() > 0.2 ? randomDate(90, 0) : null,
      certifiable: true,
      certificationStatus: randomItem(['pending', 'certified', 'certified', 'certified', 'expired'] as const),
      lastCertifiedAt: Math.random() > 0.3 ? randomDate(180, 1) : null,
      riskTags: isTierViolation
        ? ['tier_violation']
        : Math.random() > 0.9
          ? [randomItem(['toxic_combination', 'sod_violation', 'excessive_privilege'])]
          : [],
      orgId: org.id,
    })
  }
  const allEntitlements = await db.insert(schema.entitlements).values(entitlementValues).returning()
  console.log(`Created ${allEntitlements.length} entitlements`)

  // Mark tier violations on identities
  for (const identity of allIdentities) {
    const myEntitlements = allEntitlements.filter(e => e.identityId === identity.id)
    // Most privileged tier reached through any entitlement
    const effectiveTier = myEntitlements.reduce<AdTier>((t, e) => stricterTier(t, e.adTierOfPermission), 'unclassified')
    if (isStricterTier(effectiveTier, identity.adTier)) {
      await db.update(schema.identities)
        .set({ effectiveTier, tierViolation: true })
        .where(eq(schema.identities.id, identity.id))
    }
  }

  // 9. Policies (10)
  const policyDefs = [
    { name: 'Tier Breach Detection', type: 'tiering_rule' as const, severity: 'critical' as const,
      definition: { rule: 'effective_tier < ad_tier' } },
    { name: 'SoD: Finance + Audit', type: 'sod_rule' as const, severity: 'high' as const,
      definition: { conflicting_roles: ['Finance Admin', 'Audit Admin'] } },
    { name: 'Dormant Account Policy', type: 'lifecycle_policy' as const, severity: 'medium' as const,
      definition: { inactivity_days: 90 } },
    { name: 'MFA Required', type: 'mfa_policy' as const, severity: 'high' as const,
      definition: { require_mfa: true, scope: 'all_users' } },
    { name: 'Password Age Policy', type: 'password_policy' as const, severity: 'medium' as const,
      definition: { max_age_days: 90 } },
    { name: 'Quarterly Certification', type: 'certification_policy' as const, severity: 'medium' as const,
      definition: { certification_period_days: 90 } },
    { name: 'NHI Ownership Required', type: 'lifecycle_policy' as const, severity: 'high' as const,
      definition: { require_owner: true, scope: 'non_human' } },
    { name: 'Excessive Privilege Detection', type: 'access_policy' as const, severity: 'high' as const,
      definition: { max_entitlements_multiplier: 2 } },
    { name: 'Tier 0 MFA Enforcement', type: 'mfa_policy' as const, severity: 'critical' as const,
      definition: { require_mfa: true, scope: 'tier_0' } },
    { name: 'SoD: HR + IT Admin', type: 'sod_rule' as const, severity: 'high' as const,
      definition: { conflicting_roles: ['HR Admin', 'IT Admin'] } },
  ]

  const policyValues = policyDefs.map(p => ({
    ...p,
    enabled: true,
    frameworkMappings: { NCA_ECC: ['2-3-1'], SAMA_CSF: ['CC-1'] },
    orgId: org.id,
  }))
  const allPolicies = await db.insert(schema.policies).values(policyValues).returning()
  console.log(`Created ${allPolicies.length} policies`)

  // 10. Policy Violations (30)
  const violationDefs: { type: typeof schema.violationTypeEnum.enumValues[number], severity: typeof schema.severityEnum.enumValues[number], policyIdx: number }[] = [
    // 8 tier breaches
    ...Array(8).fill(null).map(() => ({ type: 'tier_breach' as const, severity: 'critical' as const, policyIdx: 0 })),
    // 5 excessive privilege
    ...Array(5).fill(null).map(() => ({ type: 'excessive_privilege' as const, severity: 'high' as const, policyIdx: 7 })),
    // 4 missing MFA
    ...Array(4).fill(null).map(() => ({ type: 'missing_mfa' as const, severity: 'high' as const, policyIdx: 3 })),
    // 4 dormant access
    ...Array(4).fill(null).map(() => ({ type: 'dormant_access' as const, severity: 'medium' as const, policyIdx: 2 })),
    // 3 orphaned identity
    ...Array(3).fill(null).map(() => ({ type: 'orphaned_identity' as const, severity: 'high' as const, policyIdx: 6 })),
    // 3 expired certification
    ...Array(3).fill(null).map(() => ({ type: 'expired_certification' as const, severity: 'medium' as const, policyIdx: 5 })),
    // 2 SoD conflicts
    ...Array(2).fill(null).map(() => ({ type: 'sod_conflict' as const, severity: 'high' as const, policyIdx: 1 })),
    // 1 password age
    { type: 'password_age' as const, severity: 'medium' as const, policyIdx: 4 },
  ]

  const violationValues = violationDefs.map((v, i) => ({
    policyId: allPolicies[v.policyIdx].id,
    identityId: randomItem(allIdentities).id,
    entitlementId: Math.random() > 0.4 ? randomItem(allEntitlements).id : undefined,
    violationType: v.type,
    severity: v.severity,
    status: i < 20 ? 'open' as const
      : i < 25 ? 'acknowledged' as const
      : i < 28 ? 'remediated' as const
      : 'excepted' as const,
    detectedAt: randomDate(60, 1),
    orgId: org.id,
  }))
  const allViolations = await db.insert(schema.policyViolations).values(violationValues).returning()
  console.log(`Created ${allViolations.length} policy violations`)

  // 11. Integration Sources (12) — a realistic demo mix: 10 connected with
  // recent syncs, one failing with a specific reason, one never configured.
  // config stays {} (no real endpoint), so the sync-health cron leaves them alone.
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)
  const connected = 'connected' as const
  const integrationValues = [
    { name: 'Corporate Active Directory', type: 'active_directory' as const,
      syncStatus: connected, lastSyncAt: minutesAgo(42),
      lastSyncRecordCount: 180, syncFrequencyMinutes: 360 },
    { name: 'Azure AD / Entra ID', type: 'azure_ad' as const,
      syncStatus: connected, lastSyncAt: minutesAgo(71),
      lastSyncRecordCount: 200, syncFrequencyMinutes: 240 },
    { name: 'Okta SSO', type: 'okta' as const,
      syncStatus: connected, lastSyncAt: minutesAgo(128),
      lastSyncRecordCount: 150, syncFrequencyMinutes: 360 },
    { name: 'SailPoint IdentityNow', type: 'sailpoint' as const,
      syncStatus: 'error' as const, lastSyncAt: minutesAgo(3 * 24 * 60 + 95),
      lastSyncRecordCount: 120, syncFrequencyMinutes: 360,
      lastSyncError: 'Connection test failed: 401 Unauthorized - OAuth client secret for API client "idr-sync" has expired' },
    { name: 'CyberArk PAM', type: 'cyberark' as const,
      syncStatus: connected, lastSyncAt: minutesAgo(18),
      lastSyncRecordCount: 45, syncFrequencyMinutes: 240 },
    { name: 'ServiceNow ITSM', type: 'servicenow' as const,
      syncStatus: 'disconnected' as const, lastSyncAt: null,
      lastSyncRecordCount: 0, syncFrequencyMinutes: 360 },
    // BeyondTrust and DigiCert — enum values added by separate migration
    { name: 'BeyondTrust PAM', type: 'beyondtrust' as any,
      syncStatus: connected, lastSyncAt: minutesAgo(97),
      lastSyncRecordCount: 38, syncFrequencyMinutes: 240 },
    { name: 'DigiCert CertCentral', type: 'digicert' as any,
      syncStatus: connected, lastSyncAt: minutesAgo(205),
      lastSyncRecordCount: 64, syncFrequencyMinutes: 360 },
    { name: 'Microsoft Defender for Identity', type: 'microsoft_defender' as any,
      syncStatus: connected, lastSyncAt: minutesAgo(9),
      lastSyncRecordCount: 312, syncFrequencyMinutes: 60 },
    { name: 'SAP GRC Access Control', type: 'sap_grc' as any,
      syncStatus: connected, lastSyncAt: minutesAgo(164),
      lastSyncRecordCount: 96, syncFrequencyMinutes: 360 },
    { name: 'HashiCorp Vault', type: 'hashicorp_vault' as any,
      syncStatus: connected, lastSyncAt: minutesAgo(53),
      lastSyncRecordCount: 52, syncFrequencyMinutes: 240 },
    { name: 'Splunk SIEM', type: 'splunk' as any,
      syncStatus: connected, lastSyncAt: minutesAgo(14),
      lastSyncRecordCount: 1480, syncFrequencyMinutes: 60 },
  ].map(i => ({ ...i, config: {}, orgId: org.id }))
  await db.insert(schema.integrationSources).values(integrationValues)
  console.log('Created 12 integration sources')

  // 12. Sample action log entries
  const sampleActor = allIdentities.find(i => i.adTier === 'tier_0' && i.type === 'human') || allIdentities[0]
  const actionLogValues = [
    { actionType: 'certify_entitlement' as const, actorIdentityId: sampleActor.id,
      targetEntitlementId: allEntitlements[0].id, payload: {},
      rationale: 'Quarterly access review completed', source: 'manual' as const, orgId: org.id },
    { actionType: 'acknowledge_violation' as const, actorIdentityId: sampleActor.id,
      targetPolicyViolationId: allViolations[0].id, payload: {},
      rationale: 'Investigating tier breach', source: 'manual' as const, orgId: org.id },
    { actionType: 'sync_source' as const, actorIdentityId: sampleActor.id,
      payload: { source: 'active_directory', records: 180 },
      rationale: 'Scheduled sync', source: 'automated' as const, orgId: org.id },
    { actionType: 'escalate_risk' as const, actorIdentityId: sampleActor.id,
      targetIdentityId: allIdentities.find(i => i.riskScore > 60)?.id || allIdentities[0].id,
      payload: { previousScore: 45, newScore: 75 },
      rationale: 'Multiple tier violations detected', source: 'automated' as const, orgId: org.id },
  ]
  await db.insert(schema.actionLog).values(actionLogValues)
  console.log('Created sample action log entries')

  // 13. AD Delegations (20 — mix of dangerous and benign)
  const t0Identities = allIdentities.filter(i => i.adTier === 'tier_0')
  const t1Identities = allIdentities.filter(i => i.adTier === 'tier_1')
  const t2Identities = allIdentities.filter(i => i.adTier === 'tier_2')
  const privilegedGroups = allGroups.filter(g => g.isPrivileged)
  const domainAdminsGroup = allGroups.find(g => g.name === 'Domain Admins')
  const enterpriseAdminsGroup = allGroups.find(g => g.name === 'Enterprise Admins')

  const delegationValues: (typeof schema.adDelegations.$inferInsert)[] = [
    // Dangerous: T2 identity with AddMember on Domain Admins group
    ...(t2Identities.slice(0, 3).map((t2, i) => ({
      sourceIdentityId: t2.id,
      targetDn: `CN=Domain Admins,CN=Users,DC=acmefs,DC=local`,
      targetObjectType: 'group',
      permission: 'add_member',
      inherited: false,
      adTierOfTarget: 'tier_0' as const,
      dangerous: true,
      orgId: org.id,
    }))),
    // Dangerous: T2 with GenericAll on a T0 user
    ...(t2Identities.slice(3, 5).map((t2) => ({
      sourceIdentityId: t2.id,
      targetDn: `CN=${t0Identities[0]?.displayName || 'Admin'},CN=Users,DC=acmefs,DC=local`,
      targetObjectType: 'user',
      permission: 'generic_all',
      inherited: false,
      adTierOfTarget: 'tier_0' as const,
      dangerous: true,
      orgId: org.id,
    }))),
    // Dangerous: T1 with WriteDacl on Domain Controllers OU
    ...(t1Identities.slice(0, 2).map((t1) => ({
      sourceIdentityId: t1.id,
      targetDn: `OU=Domain Controllers,DC=acmefs,DC=local`,
      targetObjectType: 'ou',
      permission: 'write_dacl',
      inherited: false,
      adTierOfTarget: 'tier_0' as const,
      dangerous: true,
      orgId: org.id,
    }))),
    // Dangerous: T2 with ForceChangePassword on a T0 identity
    {
      sourceIdentityId: t2Identities[5]?.id || t2Identities[0].id,
      targetDn: `CN=${t0Identities[1]?.displayName || 'SchemaAdmin'},CN=Users,DC=acmefs,DC=local`,
      targetObjectType: 'user',
      permission: 'force_change_password',
      inherited: false,
      adTierOfTarget: 'tier_0' as const,
      dangerous: true,
      orgId: org.id,
    },
    // Dangerous: T2 with WriteOwner on Enterprise Admins
    {
      sourceIdentityId: t2Identities[6]?.id || t2Identities[0].id,
      targetDn: `CN=Enterprise Admins,CN=Users,DC=acmefs,DC=local`,
      targetObjectType: 'group',
      permission: 'write_owner',
      inherited: false,
      adTierOfTarget: 'tier_0' as const,
      dangerous: true,
      orgId: org.id,
    },
    // Benign: T1 with read on T1 objects
    ...(t1Identities.slice(2, 7).map((t1, i) => ({
      sourceIdentityId: t1.id,
      targetDn: `CN=SRV-APP-${i + 1},OU=Servers,DC=acmefs,DC=local`,
      targetObjectType: 'computer',
      permission: 'read_property',
      inherited: true,
      adTierOfTarget: 'tier_1' as const,
      dangerous: false,
      orgId: org.id,
    }))),
    // Benign: T2 with read on T2 objects
    ...(t2Identities.slice(10, 15).map((t2, i) => ({
      sourceIdentityId: t2.id,
      targetDn: `CN=WS-${(i + 1).toString().padStart(3, '0')},OU=Workstations,DC=acmefs,DC=local`,
      targetObjectType: 'computer',
      permission: 'read_property',
      inherited: true,
      adTierOfTarget: 'tier_2' as const,
      dangerous: false,
      orgId: org.id,
    }))),
  ]
  await db.insert(schema.adDelegations).values(delegationValues)
  console.log(`Created ${delegationValues.length} AD delegations`)

  // 14. ACL Entries (30 — some with GenericAll on T0 objects)
  const aclValues: (typeof schema.aclEntries.$inferInsert)[] = [
    // Critical: GenericAll on Domain Admins by a T2 identity
    ...(t2Identities.slice(0, 3).map((t2) => ({
      objectDn: `CN=Domain Admins,CN=Users,DC=acmefs,DC=local`,
      objectType: 'group',
      principalIdentityId: t2.id,
      accessType: 'allow',
      rights: ['GenericAll'],
      adTierOfObject: 'tier_0' as const,
      orgId: org.id,
    }))),
    // Critical: WriteDacl on Domain Controllers
    ...(t2Identities.slice(3, 5).map((t2) => ({
      objectDn: `OU=Domain Controllers,DC=acmefs,DC=local`,
      objectType: 'ou',
      principalIdentityId: t2.id,
      accessType: 'allow',
      rights: ['WriteDacl', 'WriteProperty'],
      adTierOfObject: 'tier_0' as const,
      orgId: org.id,
    }))),
    // Critical: WriteOwner on Schema Admins by a T1 identity
    ...(t1Identities.slice(0, 2).map((t1) => ({
      objectDn: `CN=Schema Admins,CN=Users,DC=acmefs,DC=local`,
      objectType: 'group',
      principalIdentityId: t1.id,
      accessType: 'allow',
      rights: ['WriteOwner'],
      adTierOfObject: 'tier_0' as const,
      orgId: org.id,
    }))),
    // High: AddMember on privileged group via a group principal
    ...(privilegedGroups.slice(0, 3).map((pg) => ({
      objectDn: `CN=${pg.name},CN=Users,DC=acmefs,DC=local`,
      objectType: 'group',
      principalGroupId: allGroups.find(g => !g.isPrivileged)?.id || allGroups[allGroups.length - 1].id,
      accessType: 'allow',
      rights: ['AddMember'],
      adTierOfObject: pg.adTier,
      orgId: org.id,
    }))),
    // Medium: ExtendedRight on user objects
    ...(t1Identities.slice(2, 7).map((t1, i) => ({
      objectDn: `CN=SVC-APP-${i + 1},CN=Service Accounts,DC=acmefs,DC=local`,
      objectType: 'user',
      principalIdentityId: t1.id,
      accessType: 'allow',
      rights: ['ExtendedRight'],
      objectTypeGuid: 'ab721a53-1e2f-11d0-9819-00aa0040529b', // User-Force-Change-Password
      adTierOfObject: 'tier_1' as const,
      orgId: org.id,
    }))),
    // Low: ReadProperty on T2 objects
    ...(t2Identities.slice(15, 25).map((t2, i) => ({
      objectDn: `CN=WS-${(i + 1).toString().padStart(3, '0')},OU=Workstations,DC=acmefs,DC=local`,
      objectType: 'computer',
      principalIdentityId: t2.id,
      accessType: 'allow',
      rights: ['ReadProperty'],
      adTierOfObject: 'tier_2' as const,
      orgId: org.id,
    }))),
  ]
  await db.insert(schema.aclEntries).values(aclValues)
  console.log(`Created ${aclValues.length} ACL entries`)

  // 15. Pre-computed Attack Paths (10)
  const attackPathValues: (typeof schema.attackPaths.$inferInsert)[] = [
    // Path 1: T2 user → AddMember on Domain Admins → Domain Admin
    {
      sourceIdentityId: t2Identities[0].id,
      targetIdentityId: t0Identities[0]?.id,
      pathNodes: [
        { id: t2Identities[0].id, type: 'identity', name: t2Identities[0].displayName, tier: 'tier_2' },
        { id: 'dn:CN=Domain Admins,CN=Users,DC=acmefs,DC=local', type: 'group', name: 'Domain Admins', tier: 'tier_0' },
        { id: t0Identities[0]?.id || 'unknown', type: 'identity', name: t0Identities[0]?.displayName || 'T0 Admin', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[0].id, target: 'dn:CN=Domain Admins,CN=Users,DC=acmefs,DC=local', type: 'delegation', label: 'add_member', technique: 'AddMember' },
        { source: 'dn:CN=Domain Admins,CN=Users,DC=acmefs,DC=local', target: t0Identities[0]?.id || 'unknown', type: 'membership', label: 'Domain Admins', technique: 'GroupMembership' },
      ],
      pathLength: 2,
      riskScore: 95,
      attackTechnique: 'Group Membership Abuse',
      mitreId: 'T1098.002',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 2: T2 user → GenericAll on T0 user
    {
      sourceIdentityId: t2Identities[3].id,
      targetIdentityId: t0Identities[0]?.id,
      pathNodes: [
        { id: t2Identities[3].id, type: 'identity', name: t2Identities[3].displayName, tier: 'tier_2' },
        { id: t0Identities[0]?.id || 'unknown', type: 'identity', name: t0Identities[0]?.displayName || 'T0 Admin', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[3].id, target: t0Identities[0]?.id || 'unknown', type: 'acl', label: 'GenericAll', technique: 'GenericAll' },
      ],
      pathLength: 1,
      riskScore: 100,
      attackTechnique: 'AD Object Takeover',
      mitreId: 'T1222.001',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 3: T2 → group membership → T1 service → entitlement to DC
    {
      sourceIdentityId: t2Identities[7]?.id || t2Identities[0].id,
      targetResourceId: allResources.find(r => r.type === 'domain_controller')?.id,
      pathNodes: [
        { id: t2Identities[7]?.id || t2Identities[0].id, type: 'identity', name: t2Identities[7]?.displayName || t2Identities[0].displayName, tier: 'tier_2' },
        { id: allGroups.find(g => g.name === 'APP-Jenkins-Admins')?.id || allGroups[0].id, type: 'group', name: 'APP-Jenkins-Admins', tier: 'tier_1' },
        { id: allResources.find(r => r.type === 'domain_controller')?.id || allResources[0].id, type: 'resource', name: 'DC-PRIMARY', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[7]?.id || t2Identities[0].id, target: allGroups.find(g => g.name === 'APP-Jenkins-Admins')?.id || allGroups[0].id, type: 'membership', label: 'APP-Jenkins-Admins', technique: 'GroupMembership' },
        { source: allGroups.find(g => g.name === 'APP-Jenkins-Admins')?.id || allGroups[0].id, target: allResources.find(r => r.type === 'domain_controller')?.id || allResources[0].id, type: 'entitlement', label: 'Server Operator', technique: 'Entitlement' },
      ],
      pathLength: 2,
      riskScore: 85,
      attackTechnique: 'Privilege Escalation via Entitlement',
      mitreId: 'T1078.002',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 4: T2 → WriteDacl on DC OU
    {
      sourceIdentityId: t2Identities[4]?.id || t2Identities[0].id,
      pathNodes: [
        { id: t2Identities[4]?.id || t2Identities[0].id, type: 'identity', name: t2Identities[4]?.displayName || t2Identities[0].displayName, tier: 'tier_2' },
        { id: 'dn:OU=Domain Controllers,DC=acmefs,DC=local', type: 'ou', name: 'Domain Controllers', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[4]?.id || t2Identities[0].id, target: 'dn:OU=Domain Controllers,DC=acmefs,DC=local', type: 'acl', label: 'WriteDacl', technique: 'WriteDACL' },
      ],
      pathLength: 1,
      riskScore: 90,
      attackTechnique: 'DACL Modification',
      mitreId: 'T1222.001',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 5: T1 → WriteOwner on Schema Admins
    {
      sourceIdentityId: t1Identities[0]?.id || allIdentities[0].id,
      pathNodes: [
        { id: t1Identities[0]?.id || allIdentities[0].id, type: 'identity', name: t1Identities[0]?.displayName || 'T1 User', tier: 'tier_1' },
        { id: 'dn:CN=Schema Admins,CN=Users,DC=acmefs,DC=local', type: 'group', name: 'Schema Admins', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t1Identities[0]?.id || allIdentities[0].id, target: 'dn:CN=Schema Admins,CN=Users,DC=acmefs,DC=local', type: 'acl', label: 'WriteOwner', technique: 'WriteOwner' },
      ],
      pathLength: 1,
      riskScore: 88,
      attackTechnique: 'Owner Modification',
      mitreId: 'T1222.001',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 6: T2 → ForceChangePassword on T0 admin
    {
      sourceIdentityId: t2Identities[5]?.id || t2Identities[0].id,
      targetIdentityId: t0Identities[1]?.id || t0Identities[0]?.id,
      pathNodes: [
        { id: t2Identities[5]?.id || t2Identities[0].id, type: 'identity', name: t2Identities[5]?.displayName || t2Identities[0].displayName, tier: 'tier_2' },
        { id: t0Identities[1]?.id || t0Identities[0]?.id || 'unknown', type: 'identity', name: t0Identities[1]?.displayName || 'T0 Admin', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[5]?.id || t2Identities[0].id, target: t0Identities[1]?.id || t0Identities[0]?.id || 'unknown', type: 'delegation', label: 'force_change_password', technique: 'ForceChangePassword' },
      ],
      pathLength: 1,
      riskScore: 92,
      attackTechnique: 'Forced Password Change',
      mitreId: 'T1098',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 7: T2 → WriteOwner on Enterprise Admins
    {
      sourceIdentityId: t2Identities[6]?.id || t2Identities[0].id,
      pathNodes: [
        { id: t2Identities[6]?.id || t2Identities[0].id, type: 'identity', name: t2Identities[6]?.displayName || t2Identities[0].displayName, tier: 'tier_2' },
        { id: 'dn:CN=Enterprise Admins,CN=Users,DC=acmefs,DC=local', type: 'group', name: 'Enterprise Admins', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[6]?.id || t2Identities[0].id, target: 'dn:CN=Enterprise Admins,CN=Users,DC=acmefs,DC=local', type: 'delegation', label: 'write_owner', technique: 'WriteOwner' },
      ],
      pathLength: 1,
      riskScore: 91,
      attackTechnique: 'Owner Modification',
      mitreId: 'T1222.001',
      status: 'acknowledged' as const,
      orgId: org.id,
    },
    // Path 8: NHI owner compromise chain
    {
      sourceIdentityId: t2Identities[8]?.id || t2Identities[0].id,
      targetResourceId: allResources.find(r => r.type === 'domain_controller')?.id,
      pathNodes: [
        { id: t2Identities[8]?.id || t2Identities[0].id, type: 'identity', name: t2Identities[8]?.displayName || 'T2 User', tier: 'tier_2' },
        { id: nhiIds[0]?.id || allIdentities[allIdentities.length - 1].id, type: 'identity', name: nhiIds[0]?.displayName || 'svc-account', tier: 'tier_0' },
        { id: allResources.find(r => r.type === 'domain_controller')?.id || allResources[0].id, type: 'resource', name: 'DC-PRIMARY', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[8]?.id || t2Identities[0].id, target: nhiIds[0]?.id || allIdentities[allIdentities.length - 1].id, type: 'owner', label: 'owns', technique: 'OwnerOf' },
        { source: nhiIds[0]?.id || allIdentities[allIdentities.length - 1].id, target: allResources.find(r => r.type === 'domain_controller')?.id || allResources[0].id, type: 'entitlement', label: 'Domain Admin', technique: 'Entitlement' },
      ],
      pathLength: 2,
      riskScore: 82,
      attackTechnique: 'NHI Owner Compromise',
      mitreId: 'T1078.004',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 9: Multi-hop: T2 → group → nested group → Domain Admins
    {
      sourceIdentityId: t2Identities[9]?.id || t2Identities[0].id,
      pathNodes: [
        { id: t2Identities[9]?.id || t2Identities[0].id, type: 'identity', name: t2Identities[9]?.displayName || 'T2 User', tier: 'tier_2' },
        { id: allGroups.find(g => g.name === 'IT-Department')?.id || allGroups[0].id, type: 'group', name: 'IT-Department', tier: 'tier_2' },
        { id: allGroups.find(g => g.name === 'APP-ERP-Admins')?.id || allGroups[0].id, type: 'group', name: 'APP-ERP-Admins', tier: 'tier_1' },
        { id: 'dn:CN=Domain Admins,CN=Users,DC=acmefs,DC=local', type: 'group', name: 'Domain Admins', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[9]?.id || t2Identities[0].id, target: allGroups.find(g => g.name === 'IT-Department')?.id || allGroups[0].id, type: 'membership', label: 'IT-Department', technique: 'GroupMembership' },
        { source: allGroups.find(g => g.name === 'IT-Department')?.id || allGroups[0].id, target: allGroups.find(g => g.name === 'APP-ERP-Admins')?.id || allGroups[0].id, type: 'membership', label: 'nested', technique: 'GroupMembership' },
        { source: allGroups.find(g => g.name === 'APP-ERP-Admins')?.id || allGroups[0].id, target: 'dn:CN=Domain Admins,CN=Users,DC=acmefs,DC=local', type: 'acl', label: 'AddMember', technique: 'AddMember' },
      ],
      pathLength: 3,
      riskScore: 75,
      attackTechnique: 'Group Membership Abuse',
      mitreId: 'T1098.002',
      status: 'open' as const,
      orgId: org.id,
    },
    // Path 10: T2 → delegation abuse → T0 resource
    {
      sourceIdentityId: t2Identities[10]?.id || t2Identities[0].id,
      targetResourceId: allResources.find(r => r.name === 'DC-SECONDARY')?.id || allResources.find(r => r.type === 'domain_controller')?.id,
      pathNodes: [
        { id: t2Identities[10]?.id || t2Identities[0].id, type: 'identity', name: t2Identities[10]?.displayName || 'T2 User', tier: 'tier_2' },
        { id: 'dn:OU=Domain Controllers,DC=acmefs,DC=local', type: 'ou', name: 'Domain Controllers OU', tier: 'tier_0' },
        { id: allResources.find(r => r.name === 'DC-SECONDARY')?.id || allResources[0].id, type: 'resource', name: 'DC-SECONDARY', tier: 'tier_0' },
      ],
      pathEdges: [
        { source: t2Identities[10]?.id || t2Identities[0].id, target: 'dn:OU=Domain Controllers,DC=acmefs,DC=local', type: 'delegation', label: 'generic_all', technique: 'GenericAll' },
        { source: 'dn:OU=Domain Controllers,DC=acmefs,DC=local', target: allResources.find(r => r.name === 'DC-SECONDARY')?.id || allResources[0].id, type: 'entitlement', label: 'Full Control', technique: 'Entitlement' },
      ],
      pathLength: 2,
      riskScore: 87,
      attackTechnique: 'Delegation Abuse',
      mitreId: 'T1134.001',
      status: 'open' as const,
      orgId: org.id,
    },
  ]
  await db.insert(schema.attackPaths).values(attackPathValues)
  console.log(`Created ${attackPathValues.length} attack paths`)

  // 16. Sample remediation plan
  await db.insert(schema.remediationPlans).values({
    generatedBy: 'ai',
    inputParams: { budget: 50000, timelineDays: 30, riskAppetite: 'moderate' },
    rankedActions: [
      { priority: 1, action: 'Revoke Tier 0 access for Tier 2 identities', count: 8 },
      { priority: 2, action: 'Enable MFA for privileged accounts', count: 4 },
      { priority: 3, action: 'Assign owners to orphaned NHIs', count: 5 },
    ],
    executiveSummary: 'Critical tier violations require immediate attention. 8 Tier 2 identities have Tier 0 access, representing the highest risk. Enabling MFA and resolving NHI ownership will reduce overall risk by an estimated 35%.',
    projectedRiskReduction: 35,
    quickWins: [
      { action: 'Disable 10 dormant accounts', effort: 'low', impact: 'medium' },
      { action: 'Enable MFA for 4 accounts', effort: 'low', impact: 'high' },
    ],
    status: 'draft',
    orgId: org.id,
  })
  console.log('Created sample remediation plan')

  // ═══════════════════════════════════════════════
  // Phase N3: ITDR Seed Data
  // ═══════════════════════════════════════════════

  // 17. Detection Rules (10 built-in rules)
  const detectionRuleValues = [
    {
      name: 'Password Spray Detection',
      description: 'Detects >5 failed logins from same IP against different accounts in 10 minutes',
      threatType: 'password_spray',
      killChainPhase: 'credential_access',
      severity: 'high' as const,
      logic: { type: 'threshold', params: { threshold: 5, windowMinutes: 10, metric: 'unique_targets_per_ip' }, conditions: [{ field: 'eventType', op: 'eq', value: 'login_failure' }] },
      mitreTechniqueIds: ['T1110.003'],
      orgId: org.id,
    },
    {
      name: 'Credential Stuffing Detection',
      description: 'Detects >10 failed logins to single account in 5 minutes from different IPs',
      threatType: 'credential_stuffing',
      killChainPhase: 'credential_access',
      severity: 'high' as const,
      logic: { type: 'threshold', params: { threshold: 10, windowMinutes: 5, metric: 'failures_per_identity' }, conditions: [{ field: 'eventType', op: 'eq', value: 'login_failure' }] },
      mitreTechniqueIds: ['T1110.001'],
      orgId: org.id,
    },
    {
      name: 'MFA Fatigue Detection',
      description: 'Detects >3 MFA prompts with no approval in 5 minutes',
      threatType: 'mfa_fatigue',
      killChainPhase: 'credential_access',
      severity: 'high' as const,
      logic: { type: 'threshold', params: { threshold: 3, windowMinutes: 5, metric: 'mfa_prompts_no_success' }, conditions: [{ field: 'eventType', op: 'in', value: ['mfa_prompt', 'mfa_failure'] }] },
      mitreTechniqueIds: ['T1621'],
      orgId: org.id,
    },
    {
      name: 'Token Replay Detection',
      description: 'Detects same session/token from 2+ IPs within 1 hour',
      threatType: 'token_replay',
      killChainPhase: 'credential_access',
      severity: 'critical' as const,
      logic: { type: 'anomaly', params: { minIps: 2, windowMinutes: 60, metric: 'ips_per_session' }, conditions: [{ field: 'parsedFields.sessionId', op: 'exists', value: true }] },
      mitreTechniqueIds: ['T1550'],
      orgId: org.id,
    },
    {
      name: 'Impossible Travel Detection',
      description: 'Detects authentication from 2 locations >500km apart in <1 hour',
      threatType: 'impossible_travel',
      killChainPhase: 'initial_access',
      severity: 'high' as const,
      logic: { type: 'anomaly', params: { minDistanceKm: 500, windowMinutes: 60 }, conditions: [{ field: 'eventType', op: 'in', value: ['login_success', 'session_start'] }] },
      mitreTechniqueIds: ['T1078'],
      orgId: org.id,
    },
    {
      name: 'Privilege Escalation Detection',
      description: 'Detects non-admin being added to privileged groups',
      threatType: 'privilege_escalation',
      killChainPhase: 'privilege_escalation',
      severity: 'critical' as const,
      logic: { type: 'sequence', params: { groups: ['Domain Admins', 'Enterprise Admins', 'Schema Admins'] }, conditions: [{ field: 'eventType', op: 'eq', value: 'group_add' }] },
      mitreTechniqueIds: ['T1098'],
      orgId: org.id,
    },
    {
      name: 'Lateral Movement Detection',
      description: 'Detects single identity authenticating to >5 different servers in 30 minutes',
      threatType: 'lateral_movement',
      killChainPhase: 'lateral_movement',
      severity: 'high' as const,
      logic: { type: 'threshold', params: { threshold: 5, windowMinutes: 30, metric: 'unique_targets_per_identity' }, conditions: [{ field: 'eventType', op: 'in', value: ['login_success', 'session_start'] }] },
      mitreTechniqueIds: ['T1021'],
      orgId: org.id,
    },
    {
      name: 'Golden Ticket Detection',
      description: 'Detects Kerberos TGT with anomalous lifetime >10 hours',
      threatType: 'golden_ticket',
      killChainPhase: 'persistence',
      severity: 'critical' as const,
      logic: { type: 'anomaly', params: { maxLifetimeHours: 10 }, conditions: [{ field: 'eventType', op: 'eq', value: 'tgs_request' }] },
      mitreTechniqueIds: ['T1558.001'],
      orgId: org.id,
    },
    {
      name: 'DCSync Detection',
      description: 'Detects non-DC identity performing directory replication',
      threatType: 'dcsync',
      killChainPhase: 'credential_access',
      severity: 'critical' as const,
      logic: { type: 'sequence', params: {}, conditions: [{ field: 'eventType', op: 'eq', value: 'replication_request' }] },
      mitreTechniqueIds: ['T1003.006'],
      orgId: org.id,
    },
    {
      name: 'Service Account Abuse Detection',
      description: 'Detects service account authenticating interactively or from unexpected IP',
      threatType: 'service_account_abuse',
      killChainPhase: 'initial_access',
      severity: 'high' as const,
      logic: { type: 'anomaly', params: {}, conditions: [{ field: 'identity.subType', op: 'eq', value: 'service_account' }] },
      mitreTechniqueIds: ['T1078.002'],
      orgId: org.id,
    },
  ]

  await db.insert(schema.detectionRules).values(detectionRuleValues)
  console.log(`Created ${detectionRuleValues.length} detection rules`)

  // 18. Identity Events (50 sample events)
  const sampleIps = ['10.0.1.15', '10.0.2.30', '192.168.1.100', '172.16.0.50', '85.120.44.22', '203.0.113.5', '198.51.100.10']
  const sampleLocations = ['Riyadh, SA', 'Jeddah, SA', 'Dubai, AE', 'London, UK', 'New York, US']
  const sampleServers = ['DC01', 'DC02', 'APP-SRV-01', 'FILE-SRV-01', 'SQL-SRV-01', 'WEB-SRV-01', 'ERP-SRV-01']
  const eventValues: (typeof schema.identityEvents.$inferInsert)[] = []

  // Login successes
  for (let i = 0; i < 15; i++) {
    const identity = allIdentities[randomInt(0, allIdentities.length - 1)]
    eventValues.push({
      eventType: 'login_success',
      source: randomItem(['azure_sign_in', 'ad_event_log']),
      identityId: identity.id,
      parsedFields: { ipAddress: randomItem(sampleIps), location: randomItem(sampleLocations.slice(0, 2)), userAgent: 'Windows 10/Edge', result: 'success', targetResource: randomItem(sampleServers) },
      eventTimestamp: daysAgo(randomInt(0, 7)),
      orgId: org.id,
    })
  }

  // Login failures
  for (let i = 0; i < 10; i++) {
    const identity = allIdentities[randomInt(0, allIdentities.length - 1)]
    eventValues.push({
      eventType: 'login_failure',
      source: randomItem(['azure_sign_in', 'ad_event_log']),
      identityId: identity.id,
      parsedFields: { ipAddress: randomItem(sampleIps), location: randomItem(sampleLocations), result: 'failure', reason: 'invalid_password' },
      eventTimestamp: daysAgo(randomInt(0, 3)),
      orgId: org.id,
    })
  }

  // MFA prompts
  for (let i = 0; i < 8; i++) {
    const identity = allIdentities[randomInt(0, humanIds.length - 1)]
    const isSuccess = i < 5
    eventValues.push({
      eventType: isSuccess ? 'mfa_success' : 'mfa_prompt',
      source: 'azure_sign_in',
      identityId: identity.id,
      parsedFields: { ipAddress: randomItem(sampleIps), mfaMethod: randomItem(['push', 'totp', 'phone']), result: isSuccess ? 'success' : 'pending' },
      eventTimestamp: daysAgo(randomInt(0, 5)),
      orgId: org.id,
    })
  }

  // Group changes
  for (let i = 0; i < 5; i++) {
    const identity = allIdentities[randomInt(0, allIdentities.length - 1)]
    eventValues.push({
      eventType: randomItem(['group_add', 'group_remove']),
      source: 'ad_event_log',
      identityId: identity.id,
      parsedFields: { targetResource: randomItem(['Domain Admins', 'Server Operators', 'Backup Operators', 'IT-Staff', 'Finance-Users']), result: 'success' },
      eventTimestamp: daysAgo(randomInt(0, 14)),
      orgId: org.id,
    })
  }

  // Password changes
  for (let i = 0; i < 5; i++) {
    const identity = allIdentities[randomInt(0, allIdentities.length - 1)]
    eventValues.push({
      eventType: randomItem(['password_change', 'password_reset']),
      source: 'ad_event_log',
      identityId: identity.id,
      parsedFields: { ipAddress: randomItem(sampleIps), result: 'success' },
      eventTimestamp: daysAgo(randomInt(0, 30)),
      orgId: org.id,
    })
  }

  // Session events
  for (let i = 0; i < 7; i++) {
    const identity = allIdentities[randomInt(0, allIdentities.length - 1)]
    eventValues.push({
      eventType: randomItem(['session_start', 'session_end']),
      source: 'azure_sign_in',
      identityId: identity.id,
      parsedFields: { ipAddress: randomItem(sampleIps), location: randomItem(sampleLocations.slice(0, 2)), sessionId: `sess-${randomInt(1000, 9999)}`, targetResource: randomItem(sampleServers) },
      eventTimestamp: daysAgo(randomInt(0, 5)),
      orgId: org.id,
    })
  }

  await db.insert(schema.identityEvents).values(eventValues)
  console.log(`Created ${eventValues.length} identity events`)

  // 19. Identity Threats (8 sample threats)
  const threatIdentities = allIdentities.slice(0, 20)
  const threatValues: (typeof schema.identityThreats.$inferInsert)[] = [
    {
      threatType: 'dcsync',
      severity: 'critical',
      status: 'active',
      identityId: threatIdentities[0].id,
      killChainPhase: 'credential_access',
      evidence: { eventIds: [], summary: 'Non-DC identity performing directory replication requests' },
      sourceIp: '10.0.1.15',
      mitreTechniqueIds: ['T1003.006'],
      mitreTechniqueName: 'DCSync',
      confidence: 95,
      firstSeenAt: daysAgo(1),
      lastSeenAt: daysAgo(0),
      orgId: org.id,
    },
    {
      threatType: 'golden_ticket',
      severity: 'critical',
      status: 'investigating',
      identityId: threatIdentities[1].id,
      killChainPhase: 'persistence',
      evidence: { eventIds: [], summary: 'Kerberos TGT with 72-hour lifetime detected' },
      sourceIp: '10.0.2.30',
      mitreTechniqueIds: ['T1558.001'],
      mitreTechniqueName: 'Golden Ticket',
      confidence: 80,
      firstSeenAt: daysAgo(2),
      lastSeenAt: daysAgo(0),
      orgId: org.id,
    },
    {
      threatType: 'password_spray',
      severity: 'high',
      status: 'active',
      identityId: threatIdentities[2].id,
      killChainPhase: 'credential_access',
      evidence: { eventIds: [], summary: '12 accounts targeted from IP 85.120.44.22 in 8 minutes' },
      sourceIp: '85.120.44.22',
      sourceLocation: 'Unknown',
      mitreTechniqueIds: ['T1110.003'],
      mitreTechniqueName: 'Password Spraying',
      confidence: 88,
      firstSeenAt: daysAgo(0),
      lastSeenAt: daysAgo(0),
      orgId: org.id,
    },
    {
      threatType: 'mfa_fatigue',
      severity: 'high',
      status: 'active',
      identityId: threatIdentities[3].id,
      killChainPhase: 'credential_access',
      evidence: { eventIds: [], summary: '7 MFA push prompts with no approval in 4 minutes' },
      sourceIp: '203.0.113.5',
      mitreTechniqueIds: ['T1621'],
      mitreTechniqueName: 'MFA Request Generation',
      confidence: 82,
      firstSeenAt: daysAgo(0),
      lastSeenAt: daysAgo(0),
      orgId: org.id,
    },
    {
      threatType: 'privilege_escalation',
      severity: 'high',
      status: 'contained',
      identityId: threatIdentities[5].id,
      killChainPhase: 'privilege_escalation',
      evidence: { eventIds: [], summary: 'Tier 2 identity added to Domain Admins group' },
      targetResource: 'Domain Admins',
      mitreTechniqueIds: ['T1098'],
      mitreTechniqueName: 'Account Manipulation',
      confidence: 90,
      firstSeenAt: daysAgo(3),
      lastSeenAt: daysAgo(2),
      orgId: org.id,
    },
    {
      threatType: 'lateral_movement',
      severity: 'medium',
      status: 'active',
      identityId: threatIdentities[6].id,
      killChainPhase: 'lateral_movement',
      evidence: { eventIds: [], summary: 'Authentication to 8 different servers in 20 minutes' },
      sourceIp: '10.0.1.15',
      mitreTechniqueIds: ['T1021'],
      mitreTechniqueName: 'Remote Services',
      confidence: 70,
      firstSeenAt: daysAgo(1),
      lastSeenAt: daysAgo(0),
      orgId: org.id,
    },
    {
      threatType: 'impossible_travel',
      severity: 'medium',
      status: 'active',
      identityId: threatIdentities[8].id,
      killChainPhase: 'initial_access',
      evidence: { eventIds: [], summary: 'Authentication from Riyadh and London within 30 minutes' },
      sourceLocation: 'Riyadh, SA -> London, UK',
      mitreTechniqueIds: ['T1078'],
      mitreTechniqueName: 'Valid Accounts',
      confidence: 75,
      firstSeenAt: daysAgo(1),
      lastSeenAt: daysAgo(0),
      orgId: org.id,
    },
    {
      threatType: 'service_account_abuse',
      severity: 'low',
      status: 'resolved',
      identityId: nhiIds[0]?.id || threatIdentities[10].id,
      killChainPhase: 'initial_access',
      evidence: { eventIds: [], summary: 'Service account svc-erp-01 used for interactive login' },
      sourceIp: '192.168.1.100',
      mitreTechniqueIds: ['T1078.002'],
      mitreTechniqueName: 'Valid Accounts: Domain Accounts',
      confidence: 85,
      firstSeenAt: daysAgo(7),
      lastSeenAt: daysAgo(5),
      resolvedAt: daysAgo(4),
      orgId: org.id,
    },
  ]

  await db.insert(schema.identityThreats).values(threatValues)
  console.log(`Created ${threatValues.length} identity threats`)

  // ── Phase N2+N4: Shadow Admins, Canaries, Peer Groups, Supply Chain ──

  // Shadow Admins: 5 identities with T0 access but NOT in privileged groups
  const shadowAdminIdentities = allIdentities
    .filter(i => i.type === 'human' && i.adTier === 'tier_2')
    .slice(0, 5)

  const shadowAdminValues = shadowAdminIdentities.map((identity, idx) => ({
    identityId: identity.id,
    detectionMethod: ['acl_analysis', 'delegation_chain', 'nested_group', 'acl_analysis', 'gpo_rights'][idx],
    detectionReasons: [
      `Has GenericAll on domain root (CN=acmefs,DC=local) but is not a member of Domain Admins`,
      `Identity classified as Tier 2 but holds Tier 0 permissions via ${['direct ACL', 'delegation', 'nested group chain', 'WriteDacl ACE', 'GPO link'][idx]}`,
    ],
    effectiveRights: [
      ['GenericAll', 'WriteDacl', 'WriteOwner'][idx % 3],
      ...(idx < 3 ? ['ResetPassword'] : []),
    ],
    equivalentToGroups: [
      ['Domain Admins', 'Enterprise Admins'][idx % 2],
    ],
    riskScore: 80 + idx * 4,
    status: idx < 3 ? 'open' : idx === 3 ? 'confirmed' : 'remediated',
    orgId: org.id,
  }))

  if (shadowAdminValues.length > 0) {
    await db.insert(schema.shadowAdmins).values(shadowAdminValues as any)
    console.log(`Created ${shadowAdminValues.length} shadow admins`)
  }

  // Canary Identities: 3 canaries with 5 triggers
  const canaryDefs = [
    { type: 'fake_admin' as const, name: 'svc-backup-admin-01', desc: 'Fake backup admin account to detect lateral movement', placement: 'OU=ServiceAccounts,DC=acmefs,DC=local' },
    { type: 'fake_service' as const, name: 'svc-sqlreport-agent', desc: 'Fake SQL reporting service account', placement: 'CN=Services,OU=T1,DC=acmefs,DC=local' },
    { type: 'fake_api_key' as const, name: 'apikey-vault-legacy', desc: 'Fake API key planted in decommissioned config file', placement: '/opt/legacy/config.yaml' },
  ]

  const canaryIdentityRecords: { id: string }[] = []
  for (const c of canaryDefs) {
    const [cIdentity] = await db.insert(schema.identities).values({
      displayName: c.name,
      type: 'non_human',
      subType: c.type === 'fake_api_key' ? 'api_key' : 'service_account',
      status: 'active',
      adTier: c.type === 'fake_admin' ? 'tier_0' : 'tier_2',
      riskScore: 0,
      sourceSystem: 'manual',
      sourceId: `CANARY-${c.name}`,
      samAccountName: c.name,
      orgId: org.id,
    }).returning()
    canaryIdentityRecords.push(cIdentity)
  }

  const canaryRecords = await db.insert(schema.canaryIdentities).values(
    canaryDefs.map((c, idx) => ({
      identityId: canaryIdentityRecords[idx].id,
      canaryType: c.type,
      description: c.desc,
      placementLocation: c.placement,
      enabled: true,
      triggerCount: idx === 0 ? 3 : idx === 1 ? 2 : 0,
      lastTriggeredAt: idx < 2 ? daysAgo(idx === 0 ? 1 : 5) : null,
      lastTriggeredSourceIp: idx < 2 ? '10.0.1.' + randomInt(100, 200) : null,
      orgId: org.id,
    }))
  ).returning()

  // Canary Triggers: 5 total
  const triggerValues = [
    { canaryId: canaryRecords[0].id, eventType: 'NTLM authentication', sourceIp: '10.0.1.142', sourceHostname: 'WS-ATTACKER-01', triggeredAt: daysAgo(1), orgId: org.id },
    { canaryId: canaryRecords[0].id, eventType: 'Kerberos TGT request', sourceIp: '10.0.1.142', sourceHostname: 'WS-ATTACKER-01', triggeredAt: daysAgo(1), orgId: org.id },
    { canaryId: canaryRecords[0].id, eventType: 'LDAP bind attempt', sourceIp: '10.0.1.155', sourceHostname: 'SRV-COMPROMISED', triggeredAt: daysAgo(3), orgId: org.id },
    { canaryId: canaryRecords[1].id, eventType: 'SQL authentication', sourceIp: '10.0.2.88', sourceHostname: null, triggeredAt: daysAgo(5), orgId: org.id },
    { canaryId: canaryRecords[1].id, eventType: 'Service start attempt', sourceIp: '10.0.2.88', sourceHostname: 'SRV-DB-01', triggeredAt: daysAgo(5), orgId: org.id },
  ]
  await db.insert(schema.canaryTriggers).values(triggerValues)
  console.log(`Created ${canaryRecords.length} canaries with ${triggerValues.length} triggers`)

  // Peer Groups: 5 groups with stats
  const peerGroupDefs = [
    { dept: 'Information Technology', tier: 'tier_2' as const, sub: 'employee' as const, members: 25, median: 8, avg: 9.2, stddev: 3.1 },
    { dept: 'Finance', tier: 'tier_2' as const, sub: 'employee' as const, members: 18, median: 5, avg: 5.8, stddev: 2.0 },
    { dept: 'Security Operations', tier: 'tier_1' as const, sub: 'employee' as const, members: 8, median: 12, avg: 13.5, stddev: 4.2 },
    { dept: 'Engineering', tier: 'tier_2' as const, sub: 'contractor' as const, members: 12, median: 4, avg: 4.5, stddev: 1.8 },
    { dept: 'Operations', tier: 'tier_2' as const, sub: 'employee' as const, members: 15, median: 6, avg: 6.7, stddev: 2.5 },
  ]

  const peerGroupRecords = await db.insert(schema.peerGroups).values(
    peerGroupDefs.map(pg => ({
      name: `${pg.dept} / ${pg.tier} / ${pg.sub}`,
      department: pg.dept,
      adTier: pg.tier,
      subType: pg.sub,
      memberCount: pg.members,
      medianEntitlementCount: pg.median,
      avgEntitlementCount: pg.avg,
      stddevEntitlementCount: pg.stddev,
      commonEntitlements: [
        { permissionName: 'Reader', percentage: 95 },
        { permissionName: 'Basic User', percentage: 88 },
      ],
      orgId: org.id,
    }))
  ).returning()
  console.log(`Created ${peerGroupRecords.length} peer groups`)

  // Peer Anomalies: 8 anomalies
  const anomalyCandidates = allIdentities.filter(i => i.type === 'human' && i.status === 'active').slice(20, 28)
  const peerAnomalyValues = anomalyCandidates.map((identity, idx) => ({
    identityId: identity.id,
    peerGroupId: peerGroupRecords[idx % peerGroupRecords.length].id,
    anomalyType: idx < 5 ? 'excess_entitlements' : 'unique_entitlements',
    entitlementCount: 15 + idx * 3,
    peerMedian: peerGroupDefs[idx % peerGroupDefs.length].median,
    deviationScore: 2.5 + idx * 0.4,
    excessEntitlements: [
      { permissionName: 'Server Operator', tier: 'tier_1', peersWithSame: 0 },
      { permissionName: 'Backup Operator', tier: 'tier_top', peersWithSame: 1 },
    ],
    uniqueEntitlements: idx >= 5 ? [
      { permissionName: 'Domain Admin', tier: 'tier_0' },
    ] : [],
    status: idx < 6 ? 'open' : 'reviewed',
    orgId: org.id,
  }))

  if (peerAnomalyValues.length > 0) {
    await db.insert(schema.peerAnomalies).values(peerAnomalyValues)
    console.log(`Created ${peerAnomalyValues.length} peer anomalies`)
  }

  // Supply Chain: Assign specific NHI ownership for 10 humans owning 2-5 NHIs each
  const supplyChainOwners = allIdentities
    .filter(i => i.type === 'human' && i.status === 'active' && i.adTier !== 'tier_2')
    .slice(0, 10)
  const availableNhis = allIdentities.filter(i => i.type === 'non_human' && i.status === 'active')

  let nhiIdx = 0
  for (const owner of supplyChainOwners) {
    const nhiCount = randomInt(2, 5)
    for (let j = 0; j < nhiCount && nhiIdx < availableNhis.length; j++) {
      await db.update(schema.identities)
        .set({ ownerIdentityId: owner.id })
        .where(eq(schema.identities.id, availableNhis[nhiIdx].id))
      nhiIdx++
    }
  }
  console.log(`Assigned NHI ownership for ${supplyChainOwners.length} supply chain owners`)

  // Chat Sessions: 2 sample sessions with different query types
  const [adminUser] = await db.select().from(schema.users).where(eq(schema.users.email, 'admin@acmefs.sa')).limit(1)
  if (adminUser) {
    await db.insert(schema.chatSessions).values([
      {
        userId: adminUser.id,
        orgId: org.id,
        title: 'Who has Domain Admin access?',
        messages: [
          { role: 'user', content: 'Who has Domain Admin access?', timestamp: daysAgo(2).toISOString() },
          { role: 'assistant', content: 'I found 4 identities with Domain Admin access. The highest risk is admin-jdoe with a risk score of 78 and a tier violation.', timestamp: daysAgo(2).toISOString(), metadata: { suggestedActions: ['View details', 'Generate remediation plan'] } },
          { role: 'user', content: 'Which of these have tier violations?', timestamp: daysAgo(2).toISOString() },
          { role: 'assistant', content: '2 out of 4 Domain Admin holders have tier violations: admin-jdoe (T2 accessing T0) and svc-backup (Top Tier accessing T0).', timestamp: daysAgo(2).toISOString(), metadata: { suggestedActions: ['Revoke cross-tier access', 'Update tier classification'] } },
        ],
      },
      {
        userId: adminUser.id,
        orgId: org.id,
        title: 'How many orphaned service accounts?',
        messages: [
          { role: 'user', content: 'How many orphaned service accounts do we have?', timestamp: daysAgo(1).toISOString() },
          { role: 'assistant', content: 'There are 12 orphaned non-human identities without an assigned owner. 3 of these have Tier 0 access, making them critical risks.', timestamp: daysAgo(1).toISOString(), metadata: { suggestedActions: ['Assign owners', 'Disable orphaned accounts'] } },
          { role: 'user', content: 'What is the risk if we disable them?', timestamp: daysAgo(1).toISOString() },
          { role: 'assistant', content: 'Disabling orphaned NHIs would reduce your overall risk score by approximately 8%. However, 2 service accounts are actively authenticating, so disabling them may impact dependent services. I recommend reviewing their activity logs first.', timestamp: daysAgo(1).toISOString() },
        ],
      },
    ])
    console.log('Created 2 sample chat sessions')
  }

  // ── GPO Objects (15) ──
  const gpoValues: (typeof schema.gpoObjects.$inferInsert)[] = [
    // Tier 0 GPOs
    { name: 'Default Domain Policy', displayName: 'Default Domain Policy', gpoGuid: '{31B2F340-016D-11D2-945F-00C04FB984F9}', status: 'enforced', adTier: 'tier_0', version: 12, description: 'Domain-wide security settings and password policy', ownerIdentityId: t0Identities[0]?.id, orgId: org.id, createdInSourceAt: daysAgo(365), modifiedInSourceAt: daysAgo(15) },
    { name: 'Default Domain Controllers Policy', displayName: 'Default DC Policy', gpoGuid: '{6AC1786C-016F-11D2-945F-00C04FB984F9}', status: 'enforced', adTier: 'tier_0', version: 8, description: 'Security settings for all domain controllers', ownerIdentityId: t0Identities[0]?.id, orgId: org.id, createdInSourceAt: daysAgo(365), modifiedInSourceAt: daysAgo(30) },
    { name: 'Tier 0 Admin Hardening', displayName: 'T0 Admin Hardening', gpoGuid: '{A1B2C3D4-0001-0001-0001-000000000001}', status: 'enabled', adTier: 'tier_0', version: 5, description: 'Restricts T0 admin logon to T0 systems only', ownerIdentityId: t0Identities[0]?.id, orgId: org.id, createdInSourceAt: daysAgo(180), modifiedInSourceAt: daysAgo(7) },
    { name: 'LAPS Configuration - DCs', displayName: 'LAPS DCs', gpoGuid: '{A1B2C3D4-0001-0001-0001-000000000003}', status: 'enabled', adTier: 'tier_0', version: 2, description: 'Local admin password solution for domain controllers', ownerIdentityId: t0Identities[1]?.id, orgId: org.id, createdInSourceAt: daysAgo(120) },
    { name: 'Kerberos Authentication Policy', displayName: 'Kerberos Policy', gpoGuid: '{A1B2C3D4-0001-0001-0001-000000000004}', status: 'enforced', adTier: 'tier_0', version: 4, description: 'Kerberos ticket lifetime and renewal settings', ownerIdentityId: t0Identities[0]?.id, orgId: org.id, createdInSourceAt: daysAgo(300) },
    // Top Tier GPOs (Tier 0 adjacent: PKI, Entra Connect, ADFS)
    { name: 'PKI Certificate Autoenrollment', displayName: 'PKI Autoenroll', gpoGuid: '{A1B2C3D4-0001-0001-0001-000000000002}', status: 'enabled', adTier: 'tier_top', version: 3, description: 'Certificate autoenrollment for PKI infrastructure', orgId: org.id, createdInSourceAt: daysAgo(200) },
    { name: 'AD Connect Sync Policy', displayName: 'AD Connect Sync', gpoGuid: '{A1B2C3D4-0001-0001-0001-000000000005}', status: 'enabled', adTier: 'tier_top', version: 1, description: 'Policy for Azure AD Connect sync server', orgId: org.id, createdInSourceAt: daysAgo(90) },
    { name: 'ADFS Server Baseline', displayName: 'ADFS Baseline', gpoGuid: '{A1B2C3D4-0001-0001-0001-000000000006}', status: 'enabled', adTier: 'tier_top', version: 2, description: 'Baseline security for ADFS farm servers', ownerIdentityId: t0Identities[0]?.id, orgId: org.id, createdInSourceAt: daysAgo(150) },
    // Tier 1 GPOs
    { name: 'Server Baseline Security', displayName: 'Server Baseline', gpoGuid: '{B2C3D4E5-0002-0002-0002-000000000001}', status: 'enabled', adTier: 'tier_1', version: 7, description: 'Baseline hardening for all member servers', ownerIdentityId: t1Identities[0]?.id, orgId: org.id, createdInSourceAt: daysAgo(250), modifiedInSourceAt: daysAgo(20) },
    { name: 'Application Server Lockdown', displayName: 'App Server Lockdown', gpoGuid: '{B2C3D4E5-0002-0002-0002-000000000002}', status: 'enabled', adTier: 'tier_1', version: 4, description: 'Restricted logon and audit settings for app servers', ownerIdentityId: t1Identities[1]?.id, orgId: org.id, createdInSourceAt: daysAgo(180) },
    { name: 'SQL Server Hardening', displayName: 'SQL Hardening', gpoGuid: '{B2C3D4E5-0002-0002-0002-000000000003}', status: 'enabled', adTier: 'tier_1', version: 3, description: 'SQL Server specific security settings', orgId: org.id, createdInSourceAt: daysAgo(160) },
    // Tier 2 GPOs
    { name: 'Workstation Lockdown', displayName: 'WS Lockdown', gpoGuid: '{C3D4E5F6-0003-0003-0003-000000000001}', status: 'enabled', adTier: 'tier_2', version: 9, description: 'Standard workstation security baseline', ownerIdentityId: t2Identities[0]?.id, orgId: org.id, createdInSourceAt: daysAgo(300), modifiedInSourceAt: daysAgo(5) },
    { name: 'Windows Update Policy', displayName: 'WSUS Policy', gpoGuid: '{C3D4E5F6-0003-0003-0003-000000000002}', status: 'enabled', adTier: 'tier_2', version: 6, description: 'WSUS update schedule and approval settings', ownerIdentityId: t2Identities[1]?.id, orgId: org.id, createdInSourceAt: daysAgo(280) },
    { name: 'BitLocker Drive Encryption', displayName: 'BitLocker', gpoGuid: '{C3D4E5F6-0003-0003-0003-000000000003}', status: 'enabled', adTier: 'tier_2', version: 3, description: 'BitLocker encryption policy for workstations', orgId: org.id, createdInSourceAt: daysAgo(200) },
    { name: 'Remote Desktop Restrictions', displayName: 'RDP Restrictions', gpoGuid: '{C3D4E5F6-0003-0003-0003-000000000004}', status: 'disabled', adTier: 'tier_2', version: 2, description: 'RDP access restrictions (currently disabled)', orgId: org.id, createdInSourceAt: daysAgo(100) },
  ]
  const allGpos = await db.insert(schema.gpoObjects).values(gpoValues).returning()
  console.log(`Created ${allGpos.length} GPO objects`)

  const t0Gpos = allGpos.filter(g => g.adTier === 'tier_0')
  const topGpos = allGpos.filter(g => g.adTier === 'tier_top')
  const t1Gpos = allGpos.filter(g => g.adTier === 'tier_1')
  const t2Gpos = allGpos.filter(g => g.adTier === 'tier_2')

  // ── GPO Links (25) ──
  const gpoLinkValues: (typeof schema.gpoLinks.$inferInsert)[] = [
    // T0 GPOs → T0 OUs, Top Tier GPOs → Top Tier OUs
    { gpoId: t0Gpos[0].id, linkedOu: 'DC=acmefs,DC=local', linkOrder: 0, enforced: true, adTierOfOu: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[1].id, linkedOu: 'OU=Domain Controllers,DC=acmefs,DC=local', linkOrder: 0, enforced: true, adTierOfOu: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[2].id, linkedOu: 'OU=Tier 0 Admins,OU=Admin,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_0', orgId: org.id },
    { gpoId: topGpos[0].id, linkedOu: 'OU=PKI,OU=Top Tier,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_top', orgId: org.id },
    { gpoId: t0Gpos[3].id, linkedOu: 'OU=Domain Controllers,DC=acmefs,DC=local', linkOrder: 1, enforced: false, adTierOfOu: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[4].id, linkedOu: 'DC=acmefs,DC=local', linkOrder: 1, enforced: true, adTierOfOu: 'tier_0', orgId: org.id },
    { gpoId: topGpos[1].id, linkedOu: 'OU=AD Connect,OU=Top Tier,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_top', orgId: org.id },
    { gpoId: topGpos[2].id, linkedOu: 'OU=ADFS,OU=Top Tier,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_top', orgId: org.id },
    // T1 GPOs → T1 OUs
    { gpoId: t1Gpos[0].id, linkedOu: 'OU=Servers,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_1', orgId: org.id },
    { gpoId: t1Gpos[0].id, linkedOu: 'OU=Application Servers,OU=Servers,DC=acmefs,DC=local', linkOrder: 1, enforced: false, adTierOfOu: 'tier_1', orgId: org.id },
    { gpoId: t1Gpos[1].id, linkedOu: 'OU=Application Servers,OU=Servers,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_1', orgId: org.id },
    { gpoId: t1Gpos[2].id, linkedOu: 'OU=SQL Servers,OU=Servers,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_1', orgId: org.id },
    // T2 GPOs → T2 OUs
    { gpoId: t2Gpos[0].id, linkedOu: 'OU=Workstations,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_2', orgId: org.id },
    { gpoId: t2Gpos[0].id, linkedOu: 'OU=Laptops,OU=Workstations,DC=acmefs,DC=local', linkOrder: 1, enforced: false, adTierOfOu: 'tier_2', orgId: org.id },
    { gpoId: t2Gpos[1].id, linkedOu: 'OU=Workstations,DC=acmefs,DC=local', linkOrder: 1, enforced: false, adTierOfOu: 'tier_2', orgId: org.id },
    { gpoId: t2Gpos[2].id, linkedOu: 'OU=Laptops,OU=Workstations,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_2', orgId: org.id },
    // Cross-tier links (risky: T1 GPO linked to T0 OU)
    { gpoId: t1Gpos[0].id, linkedOu: 'OU=Domain Controllers,DC=acmefs,DC=local', linkOrder: 2, enforced: false, adTierOfOu: 'tier_0', orgId: org.id },
    // T2 GPO linked to T1 OU
    { gpoId: t2Gpos[0].id, linkedOu: 'OU=Servers,DC=acmefs,DC=local', linkOrder: 2, enforced: false, adTierOfOu: 'tier_1', orgId: org.id },
    // More T0 links
    { gpoId: t0Gpos[2].id, linkedOu: 'OU=Domain Controllers,DC=acmefs,DC=local', linkOrder: 2, enforced: false, adTierOfOu: 'tier_0', orgId: org.id },
    // T1 linked to workstations (over-reaching)
    { gpoId: t1Gpos[1].id, linkedOu: 'OU=Workstations,DC=acmefs,DC=local', linkOrder: 2, enforced: false, adTierOfOu: 'tier_2', orgId: org.id },
    // More T2 OU links
    { gpoId: t2Gpos[3].id, linkedOu: 'OU=Workstations,DC=acmefs,DC=local', linkOrder: 3, linkEnabled: false, enforced: false, adTierOfOu: 'tier_2', orgId: org.id },
    // Additional T0 OU links
    { gpoId: t0Gpos[0].id, linkedOu: 'OU=Tier 0 Admins,OU=Admin,DC=acmefs,DC=local', linkOrder: 1, enforced: true, adTierOfOu: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[4].id, linkedOu: 'OU=Domain Controllers,DC=acmefs,DC=local', linkOrder: 3, enforced: true, adTierOfOu: 'tier_0', orgId: org.id },
    // T1 to T1
    { gpoId: t1Gpos[2].id, linkedOu: 'OU=Database Servers,OU=Servers,DC=acmefs,DC=local', linkOrder: 1, enforced: false, adTierOfOu: 'tier_1', orgId: org.id },
    { gpoId: t1Gpos[0].id, linkedOu: 'OU=File Servers,OU=Servers,DC=acmefs,DC=local', linkOrder: 0, enforced: false, adTierOfOu: 'tier_1', orgId: org.id },
  ]
  await db.insert(schema.gpoLinks).values(gpoLinkValues)
  console.log(`Created ${gpoLinkValues.length} GPO links`)

  // ── GPO Permissions (30) ──
  const gpoPermValues: (typeof schema.gpoPermissions.$inferInsert)[] = [
    // T0 identities with proper permissions on T0 GPOs (safe)
    { gpoId: t0Gpos[0].id, trusteeIdentityId: t0Identities[0]?.id, trusteeName: t0Identities[0]?.displayName || 'T0 Admin', permissionType: 'full_control', dangerous: false, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[1].id, trusteeIdentityId: t0Identities[0]?.id, trusteeName: t0Identities[0]?.displayName || 'T0 Admin', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[2].id, trusteeIdentityId: t0Identities[1]?.id, trusteeName: t0Identities[1]?.displayName || 'T0 Admin 2', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_0', orgId: org.id },
    // DANGEROUS: T2 identities with edit on T0 GPOs
    { gpoId: t0Gpos[0].id, trusteeIdentityId: t2Identities[0]?.id, trusteeName: t2Identities[0]?.displayName || 'T2 User 1', permissionType: 'edit_settings', dangerous: true, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[1].id, trusteeIdentityId: t2Identities[1]?.id, trusteeName: t2Identities[1]?.displayName || 'T2 User 2', permissionType: 'modify_security', dangerous: true, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[2].id, trusteeIdentityId: t2Identities[2]?.id, trusteeName: t2Identities[2]?.displayName || 'T2 User 3', permissionType: 'full_control', dangerous: true, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: topGpos[0].id, trusteeIdentityId: t2Identities[3]?.id, trusteeName: t2Identities[3]?.displayName || 'T2 User 4', permissionType: 'edit_settings', dangerous: true, adTierOfGpo: 'tier_top', orgId: org.id },
    { gpoId: t0Gpos[4].id, trusteeIdentityId: t2Identities[4]?.id, trusteeName: t2Identities[4]?.displayName || 'T2 User 5', permissionType: 'link_gpo', dangerous: true, adTierOfGpo: 'tier_0', orgId: org.id },
    // DANGEROUS: T1 identities with edit on T0 GPOs
    { gpoId: t0Gpos[3].id, trusteeIdentityId: t1Identities[0]?.id, trusteeName: t1Identities[0]?.displayName || 'T1 Admin', permissionType: 'edit_settings', dangerous: true, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: topGpos[1].id, trusteeIdentityId: t1Identities[1]?.id, trusteeName: t1Identities[1]?.displayName || 'T1 Admin 2', permissionType: 'modify_security', dangerous: true, adTierOfGpo: 'tier_top', orgId: org.id },
    // T1 identities with proper permissions on T1 GPOs (safe)
    { gpoId: t1Gpos[0].id, trusteeIdentityId: t1Identities[0]?.id, trusteeName: t1Identities[0]?.displayName || 'T1 Admin', permissionType: 'full_control', dangerous: false, adTierOfGpo: 'tier_1', orgId: org.id },
    { gpoId: t1Gpos[1].id, trusteeIdentityId: t1Identities[1]?.id, trusteeName: t1Identities[1]?.displayName || 'T1 Admin 2', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_1', orgId: org.id },
    { gpoId: t1Gpos[2].id, trusteeIdentityId: t1Identities[2]?.id, trusteeName: t1Identities[2]?.displayName || 'T1 Admin 3', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_1', orgId: org.id },
    // DANGEROUS: T2 with edit on T1 GPOs
    { gpoId: t1Gpos[0].id, trusteeIdentityId: t2Identities[5]?.id, trusteeName: t2Identities[5]?.displayName || 'T2 User 6', permissionType: 'edit_settings', dangerous: true, adTierOfGpo: 'tier_1', orgId: org.id },
    { gpoId: t1Gpos[1].id, trusteeIdentityId: t2Identities[6]?.id, trusteeName: t2Identities[6]?.displayName || 'T2 User 7', permissionType: 'modify_security', dangerous: true, adTierOfGpo: 'tier_1', orgId: org.id },
    // T2 proper permissions on T2 GPOs (safe)
    { gpoId: t2Gpos[0].id, trusteeIdentityId: t2Identities[0]?.id, trusteeName: t2Identities[0]?.displayName || 'T2 User 1', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_2', orgId: org.id },
    { gpoId: t2Gpos[1].id, trusteeIdentityId: t2Identities[1]?.id, trusteeName: t2Identities[1]?.displayName || 'T2 User 2', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_2', orgId: org.id },
    // Read permissions (safe)
    { gpoId: t0Gpos[0].id, trusteeIdentityId: t1Identities[3]?.id, trusteeName: t1Identities[3]?.displayName || 'T1 Reader', permissionType: 'read', dangerous: false, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[1].id, trusteeIdentityId: t2Identities[7]?.id, trusteeName: t2Identities[7]?.displayName || 'T2 Reader', permissionType: 'read', dangerous: false, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: t1Gpos[0].id, trusteeIdentityId: t2Identities[8]?.id, trusteeName: t2Identities[8]?.displayName || 'T2 Reader 2', permissionType: 'read', dangerous: false, adTierOfGpo: 'tier_1', orgId: org.id },
    // Apply permissions (safe)
    { gpoId: t2Gpos[0].id, trusteeGroupId: allGroups.find(g => !g.isPrivileged)?.id, trusteeName: 'Domain Computers', permissionType: 'apply', dangerous: false, adTierOfGpo: 'tier_2', orgId: org.id },
    { gpoId: t2Gpos[1].id, trusteeGroupId: allGroups.find(g => !g.isPrivileged)?.id, trusteeName: 'Domain Computers', permissionType: 'apply', dangerous: false, adTierOfGpo: 'tier_2', orgId: org.id },
    // Group with edit permission on T0 GPO (dangerous)
    { gpoId: topGpos[2].id, trusteeGroupId: allGroups.find(g => g.adTier === 'tier_2')?.id || allGroups[allGroups.length - 1].id, trusteeName: allGroups.find(g => g.adTier === 'tier_2')?.name || 'T2 Group', permissionType: 'edit_settings', dangerous: true, adTierOfGpo: 'tier_top', orgId: org.id },
    // More read/apply permissions to fill 30
    { gpoId: topGpos[0].id, trusteeIdentityId: t0Identities[0]?.id, trusteeName: t0Identities[0]?.displayName || 'T0 Admin', permissionType: 'full_control', dangerous: false, adTierOfGpo: 'tier_top', orgId: org.id },
    { gpoId: t0Gpos[3].id, trusteeIdentityId: t0Identities[0]?.id, trusteeName: t0Identities[0]?.displayName || 'T0 Admin', permissionType: 'full_control', dangerous: false, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: t0Gpos[4].id, trusteeIdentityId: t0Identities[0]?.id, trusteeName: t0Identities[0]?.displayName || 'T0 Admin', permissionType: 'full_control', dangerous: false, adTierOfGpo: 'tier_0', orgId: org.id },
    { gpoId: topGpos[1].id, trusteeIdentityId: t0Identities[0]?.id, trusteeName: t0Identities[0]?.displayName || 'T0 Admin', permissionType: 'full_control', dangerous: false, adTierOfGpo: 'tier_top', orgId: org.id },
    { gpoId: topGpos[2].id, trusteeIdentityId: t0Identities[0]?.id, trusteeName: t0Identities[0]?.displayName || 'T0 Admin', permissionType: 'full_control', dangerous: false, adTierOfGpo: 'tier_top', orgId: org.id },
    { gpoId: t2Gpos[2].id, trusteeIdentityId: t2Identities[2]?.id, trusteeName: t2Identities[2]?.displayName || 'T2 User 3', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_2', orgId: org.id },
    { gpoId: t2Gpos[3].id, trusteeIdentityId: t2Identities[3]?.id, trusteeName: t2Identities[3]?.displayName || 'T2 User 4', permissionType: 'edit_settings', dangerous: false, adTierOfGpo: 'tier_2', orgId: org.id },
  ]
  await db.insert(schema.gpoPermissions).values(gpoPermValues)
  console.log(`Created ${gpoPermValues.length} GPO permissions`)

  // ── GPO settings (for RSoP / baseline drift / secret scan) ──
  // Default Domain Policy: weak password length (drift), conflicting LM level, and a GPP cpassword.
  await db.update(schema.gpoObjects).set({
    settings: {
      MinimumPasswordLength: '8', PasswordComplexity: 'Enabled', LmCompatibilityLevel: '5',
      cpassword: 'j1Uyj3Vx8TY9LtLZil2uAuZkFQA/4latT76ZwgdHdQ', // public Microsoft GPP AES key → ESC-grade secret
    },
  }).where(eq(schema.gpoObjects.id, t0Gpos[0].id))
  // Kerberos Policy linked to the same root OU with a conflicting LM level → RSoP conflict.
  await db.update(schema.gpoObjects).set({
    settings: { LmCompatibilityLevel: '2' },
  }).where(eq(schema.gpoObjects.id, t0Gpos[4].id))
  // Workstation Lockdown: dangerous settings + drift.
  await db.update(schema.gpoObjects).set({
    settings: { EnableGuestAccount: 'Enabled', SMBSigningRequired: 'Disabled', MinimumPasswordLength: '6' },
  }).where(eq(schema.gpoObjects.id, t2Gpos[0].id))
  console.log('Set GPO settings on 3 GPOs (RSoP/baseline/secret triggers)')

  // ── GPO baselines ──
  await db.insert(schema.gpoBaselines).values([
    { name: 'Domain Security Baseline', scope: 'Domain', adTier: 'unclassified', orgId: org.id,
      settings: { MinimumPasswordLength: '14', PasswordComplexity: 'Enabled', LmCompatibilityLevel: '5', SMBSigningRequired: 'Enabled', EnableGuestAccount: 'Disabled' } },
    { name: 'Tier 0 Hardening Baseline', scope: 'Tier 0 OU', adTier: 'tier_0', orgId: org.id,
      settings: { MinimumPasswordLength: '15', LmCompatibilityLevel: '5', LSAProtection: 'Enabled', SMBSigningRequired: 'Enabled' } },
    { name: 'Top Tier Hardening Baseline', scope: 'Top Tier OU', adTier: 'tier_top', orgId: org.id,
      settings: { MinimumPasswordLength: '15', LmCompatibilityLevel: '5', LSAProtection: 'Enabled', SMBSigningRequired: 'Enabled' } },
    { name: 'Workstation Baseline', scope: 'Workstations', adTier: 'tier_2', orgId: org.id,
      settings: { MinimumPasswordLength: '14', EnableGuestAccount: 'Disabled', SMBSigningRequired: 'Enabled' } },
  ])
  console.log('Created 4 GPO baselines')

  // ── AD CS (certificate templates + CA) for ESC1–ESC8 ──
  const [enterpriseCa] = await db.insert(schema.adcsAuthorities).values({
    name: 'ACME-ENTERPRISE-CA', dnsName: 'ca01.acmefs.local',
    editfAttributeSubjectAltName2: true, // ESC6
    webEnrollmentHttp: true, // ESC8
    enrollmentAgentRestrictionsEnabled: false,
    lowPrivEnrollPrincipals: ['Domain Users', 'Authenticated Users'], orgId: org.id,
  }).returning()
  await db.insert(schema.adcsTemplates).values([
    { caId: enterpriseCa.id, name: 'User-Auth-SAN', displayName: 'User Authentication (SAN)', orgId: org.id,
      published: true, enrolleeSuppliesSubject: true, requiresManagerApproval: false, authorizedSignaturesRequired: 0,
      ekus: ['client_auth'], enrollmentLowPriv: true }, // ESC1
    { caId: enterpriseCa.id, name: 'AnyPurpose', displayName: 'Any Purpose', orgId: org.id,
      published: true, enrolleeSuppliesSubject: false, requiresManagerApproval: false, authorizedSignaturesRequired: 0,
      ekus: ['any_purpose'], enrollmentLowPriv: true }, // ESC2
    { caId: enterpriseCa.id, name: 'EnrollmentAgent', displayName: 'Enrollment Agent', orgId: org.id,
      published: true, enrolleeSuppliesSubject: false, requiresManagerApproval: false, authorizedSignaturesRequired: 0,
      ekus: ['enrollment_agent'], enrollmentLowPriv: true }, // ESC3
    { caId: enterpriseCa.id, name: 'WebServer-Writable', displayName: 'Web Server (writable)', orgId: org.id,
      published: true, enrolleeSuppliesSubject: false, requiresManagerApproval: false, authorizedSignaturesRequired: 0,
      ekus: ['server_auth'], enrollmentLowPriv: false, aclWritableByLowPriv: true }, // ESC4
    { caId: enterpriseCa.id, name: 'StandardUser', displayName: 'Standard User (safe)', orgId: org.id,
      published: true, enrolleeSuppliesSubject: false, requiresManagerApproval: true, authorizedSignaturesRequired: 1,
      ekus: ['client_auth'], enrollmentLowPriv: true }, // benign — manager approval + signatures
  ])
  console.log('Created 1 CA + 5 certificate templates (ESC1–ESC8 triggers)')

  // ── Posture snapshots (trend history) ──
  const snapshotValues: (typeof schema.postureSnapshots.$inferInsert)[] = []
  for (let i = 8; i >= 0; i--) {
    const score = Math.max(40, 100 - (8 - i) * 5 + (i % 2 === 0 ? 3 : -2))
    const open = 45 - (8 - i)
    snapshotValues.push({
      orgId: org.id, capturedAt: daysAgo(i * 3), exposureScore: score, totalOpen: open,
      bySeverity: { critical: 9, high: Math.round(open * 0.6), medium: Math.round(open * 0.2), low: 2 },
      byCategory: { identity: 41, certificate: 6, gpo: 4, secret: 1 },
      byImpact: { credential_theft: 30, privilege_escalation: 16, lateral_movement: 0, persistence: 0 },
    })
  }
  await db.insert(schema.postureSnapshots).values(snapshotValues)
  console.log(`Created ${snapshotValues.length} posture snapshots (trend history)`)

  console.log('\nSeed complete!')
  console.log('Login: admin@acmefs.sa (password set via SEED_ADMIN_PASSWORD env var)')

  await client.end()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
