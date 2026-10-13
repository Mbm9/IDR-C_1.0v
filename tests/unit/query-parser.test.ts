import { describe, it, expect } from 'vitest'
import {
  parseCypherQuery,
  parseNaturalLanguageQuery,
  parseGraphQuery,
} from '@/lib/graph/query-parser'

describe('parseCypherQuery', () => {
  it('parses MATCH (i:Identity {adTier: "tier_0"})', () => {
    const result = parseCypherQuery('MATCH (i:Identity {adTier: "tier_0"})')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters.adTier).toBe('tier_0')
  })

  it('parses MATCH with relationship to Resource', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity)-[:HAS_ENTITLEMENT]->(r:Resource)'
    )
    expect(result.sourceType).toBe('Identity')
    expect(result.relationship).toBe('entitlement')
    expect(result.targetType).toBe('Resource')
  })

  it('parses MATCH with relationship to Group', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity)-[:MEMBER_OF]->(g:Group)'
    )
    expect(result.sourceType).toBe('Identity')
    expect(result.relationship).toBe('membership')
    expect(result.targetType).toBe('Group')
  })

  it('parses WHERE clause with > operator', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity) WHERE i.riskScore > 70'
    )
    expect(result.sourceType).toBe('Identity')
    expect(result.where).toBeDefined()
    expect(result.where!.field).toBe('riskScore')
    expect(result.where!.operator).toBe('>')
    expect(result.where!.value).toBe(70)
  })

  it('parses WHERE clause with = operator and string value', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity) WHERE i.status = "active"'
    )
    expect(result.where).toBeDefined()
    expect(result.where!.field).toBe('status')
    expect(result.where!.operator).toBe('=')
    expect(result.where!.value).toBe('active')
  })

  it('parses WHERE clause with >= operator', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity) WHERE i.risk_score >= 80'
    )
    expect(result.where).toBeDefined()
    expect(result.where!.operator).toBe('>=')
    expect(result.where!.value).toBe(80)
  })

  it('parses WHERE clause with <= operator', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity) WHERE i.riskScore <= 20'
    )
    expect(result.where).toBeDefined()
    expect(result.where!.operator).toBe('<=')
    expect(result.where!.value).toBe(20)
  })

  it('parses WHERE clause with != operator', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity) WHERE i.status != disabled'
    )
    expect(result.where).toBeDefined()
    expect(result.where!.operator).toBe('!=')
    expect(result.where!.value).toBe('disabled')
  })

  it('parses multiple inline properties', () => {
    const result = parseCypherQuery(
      'MATCH (i:Identity {adTier: "tier_0", status: "active"})'
    )
    expect(result.filters.adTier).toBe('tier_0')
    expect(result.filters.status).toBe('active')
  })

  it('parses MANAGES relationship', () => {
    const result = parseCypherQuery(
      'MATCH (m:Identity)-[:MANAGES]->(i:Identity)'
    )
    expect(result.relationship).toBe('manager')
    expect(result.targetType).toBe('Identity')
  })

  it('parses OWNS relationship', () => {
    const result = parseCypherQuery(
      'MATCH (o:Identity)-[:OWNS]->(n:Identity)'
    )
    expect(result.relationship).toBe('owner')
  })

  it('returns defaults for empty string', () => {
    const result = parseCypherQuery('')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters).toEqual({})
  })

  it('returns defaults for whitespace-only input', () => {
    const result = parseCypherQuery('   ')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters).toEqual({})
  })

  it('is case-insensitive for MATCH keyword', () => {
    const result = parseCypherQuery('match (i:Identity {adTier: "tier_1"})')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters.adTier).toBe('tier_1')
  })

  it('handles Resource as source type', () => {
    const result = parseCypherQuery('MATCH (r:Resource {adTier: "tier_0"})')
    expect(result.sourceType).toBe('Resource')
    expect(result.filters.adTier).toBe('tier_0')
  })

  it('handles Group as source type', () => {
    const result = parseCypherQuery('MATCH (g:Group {isPrivileged: true})')
    expect(result.sourceType).toBe('Group')
    expect(result.filters.isPrivileged).toBe('true')
  })
})

describe('parseNaturalLanguageQuery', () => {
  it('parses "tier 0 identities with violations"', () => {
    const result = parseNaturalLanguageQuery(
      'tier 0 identities with violations'
    )
    expect(result.sourceType).toBe('Identity')
    expect(result.filters.adTier).toBe('tier_0')
    expect(result.relationship).toBe('violation')
  })

  it('parses "orphaned service accounts"', () => {
    const result = parseNaturalLanguageQuery('orphaned service accounts')
    expect(result.filters.subType).toBe('service_account')
    expect(result.filters.status).toBe('orphaned')
    expect(result.filters.type).toBe('non_human')
  })

  it('parses "dormant identities"', () => {
    const result = parseNaturalLanguageQuery('dormant identities')
    expect(result.filters.status).toBe('dormant')
  })

  it('parses "high risk identities"', () => {
    const result = parseNaturalLanguageQuery('high risk identities')
    expect(result.filters.riskLevel).toBe('high')
  })

  it('parses "critical risk tier 0"', () => {
    const result = parseNaturalLanguageQuery('critical risk tier 0')
    expect(result.filters.riskLevel).toBe('critical')
    expect(result.filters.adTier).toBe('tier_0')
  })

  it('parses "tier 1 identities with entitlements"', () => {
    const result = parseNaturalLanguageQuery(
      'tier 1 identities with entitlements'
    )
    expect(result.filters.adTier).toBe('tier_1')
    expect(result.relationship).toBe('entitlement')
  })

  it('parses "tier 2 employees"', () => {
    const result = parseNaturalLanguageQuery('tier 2 employees')
    expect(result.filters.adTier).toBe('tier_2')
    expect(result.filters.subType).toBe('employee')
    expect(result.filters.type).toBe('human')
  })

  it('parses "top tier" as tier_top', () => {
    expect(parseNaturalLanguageQuery('top tier service accounts').filters.adTier).toBe('tier_top')
    expect(parseNaturalLanguageQuery('Top-Tier identities').filters.adTier).toBe('tier_top')
    expect(parseNaturalLanguageQuery('tier top admins').filters.adTier).toBe('tier_top')
    expect(parseNaturalLanguageQuery('tier_top identities').filters.adTier).toBe('tier_top')
    expect(parseNaturalLanguageQuery('tier 0 adjacent identities').filters.adTier).toBe('tier_top')
  })

  it('parses Arabic "المستوى العلوي" as tier_top', () => {
    expect(parseNaturalLanguageQuery('هويات المستوى العلوي').filters.adTier).toBe('tier_top')
  })

  it('does not read "top" alone as a tier', () => {
    expect(parseNaturalLanguageQuery('top risky identities').filters.adTier).toBeUndefined()
  })

  it('parses "managed identities"', () => {
    const result = parseNaturalLanguageQuery('managed identities')
    expect(result.filters.subType).toBe('managed_identity')
    expect(result.filters.type).toBe('non_human')
  })

  it('parses "app registration with permissions"', () => {
    const result = parseNaturalLanguageQuery('app registration with permissions')
    expect(result.filters.subType).toBe('app_registration')
    expect(result.filters.type).toBe('non_human')
    expect(result.relationship).toBe('entitlement')
  })

  it('parses "identities with group memberships"', () => {
    const result = parseNaturalLanguageQuery(
      'identities with group memberships'
    )
    expect(result.relationship).toBe('membership')
    expect(result.targetType).toBe('Group')
  })

  it('parses "disabled accounts"', () => {
    const result = parseNaturalLanguageQuery('disabled accounts')
    expect(result.filters.status).toBe('disabled')
  })

  it('parses "suspended contractors"', () => {
    const result = parseNaturalLanguageQuery('suspended contractors')
    expect(result.filters.status).toBe('suspended')
    expect(result.filters.subType).toBe('contractor')
    expect(result.filters.type).toBe('human')
  })

  it('parses "non-human identities"', () => {
    const result = parseNaturalLanguageQuery('non-human identities')
    expect(result.filters.type).toBe('non_human')
  })

  it('parses "nhi with tier violations"', () => {
    const result = parseNaturalLanguageQuery('nhi with tier violations')
    expect(result.filters.type).toBe('non_human')
    expect(result.filters.tierViolation).toBe('true')
  })

  it('parses "identities accessing resources"', () => {
    const result = parseNaturalLanguageQuery('identities accessing resources')
    expect(result.relationship).toBe('entitlement')
    expect(result.targetType).toBe('Resource')
  })

  it('parses "api key identities"', () => {
    const result = parseNaturalLanguageQuery('api key identities')
    expect(result.filters.subType).toBe('api_key')
    expect(result.filters.type).toBe('non_human')
  })

  it('parses "vendors"', () => {
    const result = parseNaturalLanguageQuery('vendors')
    expect(result.filters.subType).toBe('vendor')
    expect(result.filters.type).toBe('human')
  })

  it('returns defaults for empty string', () => {
    const result = parseNaturalLanguageQuery('')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters).toEqual({})
  })

  it('returns defaults for whitespace-only string', () => {
    const result = parseNaturalLanguageQuery('   ')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters).toEqual({})
  })
})

describe('parseGraphQuery (top-level dispatcher)', () => {
  it('dispatches Cypher queries to parseCypherQuery', () => {
    const result = parseGraphQuery('MATCH (i:Identity {adTier: "tier_0"})')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters.adTier).toBe('tier_0')
  })

  it('dispatches natural language to parseNaturalLanguageQuery', () => {
    const result = parseGraphQuery('orphaned service accounts')
    expect(result.filters.subType).toBe('service_account')
    expect(result.filters.status).toBe('orphaned')
  })

  it('returns defaults for empty string', () => {
    const result = parseGraphQuery('')
    expect(result.sourceType).toBe('Identity')
    expect(result.filters).toEqual({})
  })

  it('is case-insensitive for detecting Cypher vs NL', () => {
    const result = parseGraphQuery('match (i:Identity)')
    expect(result.sourceType).toBe('Identity')
  })

  it('treats non-MATCH strings as natural language', () => {
    const result = parseGraphQuery('show me tier 0 identities')
    expect(result.filters.adTier).toBe('tier_0')
  })
})
