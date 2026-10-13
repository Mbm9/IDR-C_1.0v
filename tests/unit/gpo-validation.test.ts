import { describe, it, expect } from 'vitest'
import {
  buildGpoValidationReport, evaluateGpoFindings, evaluatePolicyCompliance,
  type ValidationInput, type IdentityInputRow,
} from '@/lib/reports/gpo-validation'

const NOW = new Date('2026-10-13T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function ident(id: string, over: Partial<IdentityInputRow> = {}): IdentityInputRow {
  return {
    id, displayName: id, type: 'human', status: 'active', adTier: 'tier_2',
    lastLogonAt: daysAgo(3), ownerIdentityId: null, mfa: true, passwordLastSetAt: daysAgo(10), tierViolation: false,
    ...over,
  }
}

function base(over: Partial<ValidationInput> = {}): ValidationInput {
  return {
    gpos: [
      { id: 'g0', name: 'DC Policy', adTier: 'tier_0', status: 'enabled', ownerIdentityId: 'admin0', settings: null },
      { id: 'g1', name: 'Server Policy', adTier: 'tier_1', status: 'enabled', ownerIdentityId: 'admin0', settings: null },
      { id: 'g2', name: 'Workstation Policy', adTier: 'tier_2', status: 'enabled', ownerIdentityId: null, settings: null },
    ],
    permissions: [], identities: [ident('admin0', { adTier: 'tier_0' })], groups: [], links: [], baselines: [],
    policies: [], violations: [], now: NOW,
    ...over,
  }
}

describe('GPO-to-account validation', () => {
  it('flags edit rights held below the GPO tier (critical on Tier 0), but not read rights', () => {
    const f = evaluateGpoFindings(base({
      identities: [ident('admin0', { adTier: 'tier_0' }), ident('u2')],
      permissions: [
        { gpoId: 'g0', trusteeIdentityId: 'u2', trusteeGroupId: null, trusteeName: 'u2', permissionType: 'edit_settings' },
        { gpoId: 'g1', trusteeIdentityId: 'u2', trusteeGroupId: null, trusteeName: 'u2', permissionType: 'link_gpo' },
        { gpoId: 'g0', trusteeIdentityId: 'u2', trusteeGroupId: null, trusteeName: 'u2', permissionType: 'read' },
      ],
    })).filter((x) => x.check === 'edit_right_below_tier')
    expect(f.map((x) => [x.gpoName, x.severity])).toEqual([['DC Policy', 'critical'], ['Server Policy', 'high']])
  })

  it('reports group trustees with their member count', () => {
    const f = evaluateGpoFindings(base({
      groups: [{ id: 'grp', name: 'IT-Department', adTier: 'tier_2', memberCount: 20 }],
      permissions: [{ gpoId: 'g0', trusteeIdentityId: null, trusteeGroupId: 'grp', trusteeName: 'IT-Department', permissionType: 'edit_settings' }],
    }))
    const hit = f.find((x) => x.check === 'edit_right_below_tier')!
    expect(hit.trustee).toMatchObject({ kind: 'group', name: 'IT-Department', memberCount: 20 })
  })

  it('flags dormant or long-unused editors, MFA-less editors, and Tier 0 admins on lower tiers', () => {
    const f = evaluateGpoFindings(base({
      identities: [
        ident('admin0', { adTier: 'tier_0', status: 'dormant', lastLogonAt: daysAgo(140) }),
        ident('t0nomfa', { adTier: 'tier_0', mfa: false }),
      ],
      permissions: [
        { gpoId: 'g0', trusteeIdentityId: 'admin0', trusteeGroupId: null, trusteeName: 'admin0', permissionType: 'full_control' },
        { gpoId: 'g1', trusteeIdentityId: 't0nomfa', trusteeGroupId: null, trusteeName: 't0nomfa', permissionType: 'edit_settings' },
      ],
    }))
    const checks = f.map((x) => `${x.check}:${x.gpoName}:${x.severity}`)
    expect(checks).toContain('inactive_trustee:DC Policy:high')
    expect(checks).toContain('tier0_admin_on_lower_tier:Server Policy:medium')
    expect(checks).toContain('trustee_without_mfa:Server Policy:medium')
    expect(checks.some((c) => c.startsWith('edit_right_below_tier'))).toBe(false)
  })

  it('flags a lower-tier GPO applied to a higher-tier OU, ignoring disabled links', () => {
    const f = evaluateGpoFindings(base({
      links: [
        { gpoId: 'g1', linkedOu: 'OU=Domain Controllers', linkOrder: 1, enforced: false, linkEnabled: true, adTierOfOu: 'tier_0' },
        { gpoId: 'g2', linkedOu: 'OU=Servers', linkOrder: 1, enforced: false, linkEnabled: false, adTierOfOu: 'tier_1' },
        { gpoId: 'g1', linkedOu: 'OU=Workstations', linkOrder: 1, enforced: false, linkEnabled: true, adTierOfOu: 'tier_2' },
      ],
    }))
    expect(f.filter((x) => x.check === 'link_tier_inversion').map((x) => [x.ou?.dn, x.severity])).toEqual([['OU=Domain Controllers', 'critical']])
    expect(f.filter((x) => x.check === 'link_scope_mismatch')).toHaveLength(1)
  })

  describe('Top Tier (Tier 0 adjacent)', () => {
    const withTop = (over: Partial<ValidationInput> = {}) => base({
      gpos: [
        ...base().gpos,
        { id: 'gt', name: 'PKI Policy', adTier: 'tier_top', status: 'enabled', ownerIdentityId: null, settings: null },
      ],
      ...over,
    })

    it('treats a Tier 1 editor of a Top Tier GPO as critical, like Tier 0', () => {
      const f = evaluateGpoFindings(withTop({
        identities: [ident('admin0', { adTier: 'tier_0' }), ident('u1', { adTier: 'tier_1' })],
        permissions: [{ gpoId: 'gt', trusteeIdentityId: 'u1', trusteeGroupId: null, trusteeName: 'u1', permissionType: 'edit_settings' }],
      }))
      expect(f.filter((x) => x.check === 'edit_right_below_tier').map((x) => [x.gpoName, x.severity])).toEqual([['PKI Policy', 'critical']])
    })

    it('treats a Top Tier editor of a Tier 0 GPO as below tier, and a Top Tier GPO admin by Tier 0 as fine', () => {
      const f = evaluateGpoFindings(withTop({
        identities: [ident('admin0', { adTier: 'tier_0' }), ident('top', { adTier: 'tier_top' })],
        permissions: [
          { gpoId: 'g0', trusteeIdentityId: 'top', trusteeGroupId: null, trusteeName: 'top', permissionType: 'edit_settings' },
          { gpoId: 'gt', trusteeIdentityId: 'admin0', trusteeGroupId: null, trusteeName: 'admin0', permissionType: 'edit_settings' },
          { gpoId: 'gt', trusteeIdentityId: 'top', trusteeGroupId: null, trusteeName: 'top', permissionType: 'edit_settings' },
        ],
      }))
      const checks = f.filter((x) => x.trustee).map((x) => `${x.check}:${x.gpoName}:${x.trustee!.name}:${x.severity}`)
      expect(checks).toEqual(['edit_right_below_tier:DC Policy:top:critical'])
    })

    it('flags a Top Tier GPO linked to a Tier 0 OU as an inversion (critical)', () => {
      const f = evaluateGpoFindings(withTop({
        links: [{ gpoId: 'gt', linkedOu: 'OU=Domain Controllers', linkOrder: 1, enforced: false, linkEnabled: true, adTierOfOu: 'tier_0' }],
      }))
      expect(f.filter((x) => x.check === 'link_tier_inversion').map((x) => [x.gpoName, x.severity])).toEqual([['PKI Policy', 'critical']])
    })

    it('flags a Tier 1 GPO linked to a Top Tier OU as a critical inversion', () => {
      const f = evaluateGpoFindings(withTop({
        links: [{ gpoId: 'g1', linkedOu: 'OU=PKI', linkOrder: 1, enforced: false, linkEnabled: true, adTierOfOu: 'tier_top' }],
      }))
      expect(f.filter((x) => x.check === 'link_tier_inversion').map((x) => [x.gpoName, x.severity])).toEqual([['Server Policy', 'critical']])
    })

    it('treats a Tier 0 GPO linked to a Top Tier OU as a low scope mismatch, not an inversion', () => {
      const f = evaluateGpoFindings(withTop({
        links: [{ gpoId: 'g0', linkedOu: 'OU=PKI', linkOrder: 1, enforced: false, linkEnabled: true, adTierOfOu: 'tier_top' }],
      }))
      expect(f.filter((x) => x.check === 'link_tier_inversion')).toHaveLength(0)
      expect(f.filter((x) => x.check === 'link_scope_mismatch').map((x) => [x.gpoName, x.severity])).toEqual([['DC Policy', 'low']])
    })

    it('raises ownerless and drift findings on Top Tier like Tier 0, falling back to the Domain baseline', () => {
      const gpos = withTop().gpos.map((g) => g.id === 'gt' ? { ...g, settings: { MinimumPasswordLength: '8' } } : g)
      const f = evaluateGpoFindings(withTop({
        gpos,
        links: [{ gpoId: 'gt', linkedOu: 'OU=PKI', linkOrder: 1, enforced: false, linkEnabled: true, adTierOfOu: 'tier_top' }],
        baselines: [
          { name: 'Domain Baseline', scope: 'Domain', adTier: 'unclassified', settings: { MinimumPasswordLength: '14' } },
          { name: 'Server Baseline', scope: 'Servers', adTier: 'tier_1', settings: { MinimumPasswordLength: '12' } },
        ],
      }))
      expect(f.find((x) => x.check === 'gpo_without_owner' && x.gpoId === 'gt')!.severity).toBe('medium')
      const drift = f.find((x) => x.check === 'baseline_drift')!
      expect(drift.severity).toBe('high')
      expect(drift.evidence).toMatchObject({ baseline: 'Domain Baseline', expected: '14' })
    })

    it('sorts Top Tier GPOs between Tier 0 and Tier 1', () => {
      const r = buildGpoValidationReport(withTop())
      expect(r.gpos.map((g) => g.tier)).toEqual(['tier_0', 'tier_top', 'tier_1', 'tier_2'])
    })
  })

  it('flags GPP passwords without exposing the value, dangerous values and baseline drift', () => {
    const gpos = base().gpos.map((g) => g.id === 'g2'
      ? { ...g, settings: { cpassword: 'SECRETVALUE', EnableGuestAccount: 'Enabled', MinimumPasswordLength: '6' } }
      : g)
    const f = evaluateGpoFindings(base({
      gpos,
      links: [{ gpoId: 'g2', linkedOu: 'OU=Workstations', linkOrder: 1, enforced: false, linkEnabled: true, adTierOfOu: 'tier_2' }],
      baselines: [{ name: 'Workstation Baseline', scope: 'Workstations', adTier: 'tier_2', settings: { MinimumPasswordLength: '14' } }],
    }))
    expect(JSON.stringify(f)).not.toContain('SECRETVALUE')
    expect(f.map((x) => x.check)).toEqual(expect.arrayContaining(['gpp_password', 'insecure_setting', 'baseline_drift', 'gpo_without_owner']))
    expect(f.find((x) => x.check === 'baseline_drift')!.evidence).toMatchObject({ actual: '6', expected: '14' })
  })
})

describe('policy compliance', () => {
  it('combines recorded violations with direct measurement and counts unrecorded failures', () => {
    const input = base({
      identities: [
        ident('a', { adTier: 'tier_0', mfa: false }),
        ident('b', { adTier: 'tier_0' }),
        ident('svc', { adTier: 'tier_0', type: 'non_human', mfa: false }),
        ident('c', { mfa: false }),
      ],
      policies: [
        { id: 'p0', name: 'Tier 0 MFA', type: 'mfa_policy', severity: 'critical', enabled: true, definition: { scope: 'tier_0', require_mfa: true }, frameworkMappings: {} },
        { id: 'p1', name: 'MFA Required', type: 'mfa_policy', severity: 'high', enabled: true, definition: { scope: 'all_users', require_mfa: true }, frameworkMappings: {} },
        { id: 'p2', name: 'SoD', type: 'sod_rule', severity: 'high', enabled: true, definition: {}, frameworkMappings: {} },
      ],
      violations: [
        { policyId: 'p1', identityId: 'c', status: 'open' },
        { policyId: 'p2', identityId: 'b', status: 'excepted' },
      ],
    })
    const rows = Object.fromEntries(evaluatePolicyCompliance(input).map((r) => [r.policyId, r]))
    // Service accounts are outside MFA; 'a' fails but was never recorded.
    expect(rows.p0).toMatchObject({ inScope: 3, recordedNonCompliant: 0, measuredNonCompliant: 1, unrecorded: 1, compliancePct: 66.7 })
    expect(rows.p1).toMatchObject({ recordedNonCompliant: 1, measuredNonCompliant: 2, nonCompliant: 2, unrecorded: 1 })
    expect(rows.p2).toMatchObject({ measuredNonCompliant: null, exceptions: 1, compliancePct: 100 })
  })

  it('builds totals consistently', () => {
    const r = buildGpoValidationReport(base({
      identities: [ident('admin0', { adTier: 'tier_0' }), ident('u2')],
      permissions: [{ gpoId: 'g0', trusteeIdentityId: 'u2', trusteeGroupId: null, trusteeName: 'u2', permissionType: 'edit_settings' }],
    }))
    expect(r.totals.gpos).toBe(3)
    expect(r.totals.editGrants).toBe(1)
    expect(r.totals.validEditGrants).toBe(0)
    expect(r.gpos.find((g) => g.name === 'DC Policy')!.compliant).toBe(false)
    expect(Object.values(r.totals.findingsBySeverity).reduce((a, b) => a + b, 0)).toBe(r.findings.length)
  })
})
