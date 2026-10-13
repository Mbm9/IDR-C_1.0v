import { vi } from 'vitest'

// Sample identity data for tests
export const sampleIdentities = [
  {
    id: 'id-1',
    displayName: 'John Admin',
    type: 'human',
    subType: 'employee',
    status: 'active',
    adTier: 'tier_0',
    effectiveTier: 'tier_0',
    tierViolation: false,
    riskScore: 85,
    riskFactors: {},
    sourceSystem: 'active_directory',
    sourceId: 'ad-001',
    upn: 'john.admin@corp.local',
    samAccountName: 'john.admin',
    email: 'john.admin@corp.com',
    department: 'IT',
    managerIdentityId: null,
    lastLogonAt: new Date('2026-03-25'),
    passwordLastSetAt: new Date('2026-01-01'),
    createdInSourceAt: new Date('2024-01-01'),
    ownerIdentityId: null,
    expiryAt: null,
    orgId: 'test-org-id',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2026-03-25'),
  },
  {
    id: 'id-2',
    displayName: 'SVC-AppBackend',
    type: 'non_human',
    subType: 'service_account',
    status: 'active',
    adTier: 'tier_1',
    effectiveTier: 'tier_0',
    tierViolation: true,
    riskScore: 72,
    riskFactors: {},
    sourceSystem: 'active_directory',
    sourceId: 'ad-002',
    upn: 'svc-app@corp.local',
    samAccountName: 'svc-app',
    email: null,
    department: null,
    managerIdentityId: null,
    lastLogonAt: new Date('2026-03-20'),
    passwordLastSetAt: new Date('2025-06-01'),
    createdInSourceAt: new Date('2024-06-01'),
    ownerIdentityId: 'id-1',
    expiryAt: null,
    orgId: 'test-org-id',
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2026-03-20'),
  },
  {
    id: 'id-3',
    displayName: 'Rana PKI Admin',
    type: 'human',
    subType: 'employee',
    status: 'active',
    adTier: 'tier_top',
    effectiveTier: 'tier_top',
    tierViolation: false,
    riskScore: 64,
    riskFactors: {},
    sourceSystem: 'active_directory',
    sourceId: 'ad-003',
    upn: 'rana.pki@corp.local',
    samAccountName: 'rana.pki',
    email: 'rana.pki@corp.com',
    department: 'IT',
    managerIdentityId: null,
    lastLogonAt: new Date('2026-03-24'),
    passwordLastSetAt: new Date('2026-02-01'),
    createdInSourceAt: new Date('2024-03-01'),
    ownerIdentityId: null,
    expiryAt: null,
    orgId: 'test-org-id',
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2026-03-24'),
  },
]

export const sampleViolations = [
  {
    id: 'v-1',
    violationType: 'tier_breach',
    severity: 'critical',
    status: 'open',
    detectedAt: new Date('2026-03-20'),
    remediatedAt: null,
    exceptionReason: null,
    exceptionExpiresAt: null,
    policyName: 'Tier Isolation Policy',
    identityId: 'id-2',
    identityName: 'SVC-AppBackend',
    identityType: 'non_human',
  },
  {
    id: 'v-2',
    violationType: 'missing_mfa',
    severity: 'high',
    status: 'open',
    detectedAt: new Date('2026-03-21'),
    remediatedAt: null,
    exceptionReason: null,
    exceptionExpiresAt: null,
    policyName: 'MFA Enforcement',
    identityId: 'id-1',
    identityName: 'John Admin',
    identityType: 'human',
  },
]

export const sampleGraphData = {
  nodes: [
    {
      id: 'id-1',
      label: 'John Admin',
      type: 'identity',
      subType: 'employee',
      tier: 'tier_0',
      riskScore: 85,
      tierViolation: false,
      identityType: 'human',
      properties: {},
    },
    {
      id: 'res-1',
      label: 'DC-01',
      type: 'resource',
      subType: 'domain_controller',
      tier: 'tier_0',
      properties: {},
    },
    {
      id: 'res-2',
      label: 'SRV-PKI-01',
      type: 'resource',
      subType: 'server',
      tier: 'tier_top',
      properties: {},
    },
    {
      id: 'grp-1',
      label: 'Domain Admins',
      type: 'group',
      tier: 'tier_0',
      isPrivileged: true,
      properties: {},
    },
  ],
  links: [
    { source: 'id-1', target: 'res-1', type: 'entitlement', label: 'Domain Admin' },
    { source: 'id-1', target: 'grp-1', type: 'membership' },
  ],
}

/**
 * Creates a mock db with chainable query builder methods.
 * Used to mock '@/lib/db' in integration tests.
 */
export function createMockDb(overrides: Record<string, any> = {}) {
  const chainable = () => {
    const chain: any = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      groupBy: () => chain,
      then: (resolve: any) => resolve(overrides.result ?? []),
    }
    return chain
  }

  return {
    select: chainable().select,
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
    ...overrides,
  }
}
