/**
 * Graph Query Parser
 *
 * Parses both Cypher-like queries and natural language queries
 * into a structured GraphQuery object used to filter the identity graph.
 */

export interface GraphQuery {
  sourceType?: 'Identity' | 'Resource' | 'Group'
  targetType?: 'Identity' | 'Resource' | 'Group'
  relationship?: 'entitlement' | 'membership' | 'manager' | 'owner' | 'violation'
  filters: Record<string, string | number | boolean>
  where?: {
    field: string
    operator: '>' | '<' | '>=' | '<=' | '=' | '!='
    value: string | number
  }
}

const DEFAULT_QUERY: GraphQuery = {
  sourceType: 'Identity',
  filters: {},
}

/**
 * Parse a Cypher-like MATCH query.
 *
 * Examples:
 *   MATCH (i:Identity {adTier: "tier_0"})
 *   MATCH (i:Identity)-[:HAS_ENTITLEMENT]->(r:Resource)
 *   MATCH (i:Identity) WHERE i.riskScore > 70
 */
export function parseCypherQuery(query: string): GraphQuery {
  const trimmed = query.trim()
  if (!trimmed) return { ...DEFAULT_QUERY }

  const result: GraphQuery = { filters: {} }

  // Match source node: (alias:Type {prop: "val", ...})
  const sourceMatch = trimmed.match(
    /MATCH\s+\(\s*(\w+)\s*:\s*(\w+)\s*(?:\{([^}]*)\})?\s*\)/i
  )
  if (sourceMatch) {
    const [, , type, propsStr] = sourceMatch
    result.sourceType = normalizeNodeType(type)

    if (propsStr) {
      parseInlineProps(propsStr, result.filters)
    }
  }

  // Match relationship: -[:REL_TYPE]->
  const relMatch = trimmed.match(/-\[\s*:?\s*(\w+)\s*\]->/i)
  if (relMatch) {
    result.relationship = normalizeRelationship(relMatch[1])
  }

  // Match target node after relationship: ->(alias:Type)
  const targetMatch = trimmed.match(/->\s*\(\s*\w+\s*:\s*(\w+)\s*(?:\{[^}]*\})?\s*\)/i)
  if (targetMatch) {
    result.targetType = normalizeNodeType(targetMatch[1])
  }

  // Match WHERE clause: WHERE alias.field op value
  const whereMatch = trimmed.match(
    /WHERE\s+\w+\.(\w+)\s*(>=|<=|!=|>|<|=)\s*["']?([^"'\s]+)["']?/i
  )
  if (whereMatch) {
    const [, field, operator, rawValue] = whereMatch
    const numVal = Number(rawValue)
    result.where = {
      field: camelCase(field),
      operator: operator as '>' | '<' | '>=' | '<=' | '=' | '!=',
      value: isNaN(numVal) ? rawValue : numVal,
    }
  }

  // If nothing was parsed, return defaults
  if (!result.sourceType && !result.relationship && Object.keys(result.filters).length === 0 && !result.where) {
    return { ...DEFAULT_QUERY }
  }

  return result
}

/**
 * Parse a natural language query into a GraphQuery.
 *
 * Examples:
 *   "tier 0 identities with violations"
 *   "top tier service accounts"
 *   "orphaned service accounts"
 *   "high risk identities"
 */
export function parseNaturalLanguageQuery(query: string): GraphQuery {
  const lower = query.toLowerCase().trim()
  if (!lower) return { ...DEFAULT_QUERY }

  const result: GraphQuery = {
    sourceType: 'Identity',
    filters: {},
  }

  // Tier detection ("top tier" / "tier top" / "tier 0 adjacent" / Arabic "المستوى العلوي" → tier_top)
  const tierMatch = lower.match(/tier\s*([012])/i)
  if (/\btop[\s_-]*tier\b|\btier[\s_-]*top\b|tier[\s_-]*0[\s_-]*adjacent|المستوى\s*العلوي/.test(lower)) {
    result.filters.adTier = 'tier_top'
  } else if (tierMatch) {
    result.filters.adTier = `tier_${tierMatch[1]}`
  }

  // Status detection
  if (lower.includes('orphan')) {
    result.filters.status = 'orphaned'
  } else if (lower.includes('dormant')) {
    result.filters.status = 'dormant'
  } else if (lower.includes('disabled')) {
    result.filters.status = 'disabled'
  } else if (lower.includes('active')) {
    result.filters.status = 'active'
  } else if (lower.includes('inactive')) {
    result.filters.status = 'inactive'
  } else if (lower.includes('suspended')) {
    result.filters.status = 'suspended'
  }

  // Sub-type detection
  if (lower.includes('service account')) {
    result.filters.subType = 'service_account'
  } else if (lower.includes('managed identity') || lower.includes('managed identit') || lower.includes('managed identities')) {
    result.filters.subType = 'managed_identity'
  } else if (lower.includes('app registration')) {
    result.filters.subType = 'app_registration'
  } else if (lower.includes('api key')) {
    result.filters.subType = 'api_key'
  } else if (lower.includes('bot')) {
    result.filters.subType = 'bot'
  } else if (lower.includes('contractor')) {
    result.filters.subType = 'contractor'
  } else if (lower.includes('employee')) {
    result.filters.subType = 'employee'
  } else if (lower.includes('vendor')) {
    result.filters.subType = 'vendor'
  }

  // Identity type
  if (
    lower.includes('non-human') ||
    lower.includes('non human') ||
    lower.includes('nhi') ||
    lower.includes('service account') ||
    lower.includes('managed identity') ||
    lower.includes('managed identit') ||
    lower.includes('app registration') ||
    lower.includes('api key') ||
    lower.includes('machine') ||
    lower.includes('bot')
  ) {
    result.filters.type = 'non_human'
  } else if (lower.includes('human') || lower.includes('employee') || lower.includes('contractor') || lower.includes('vendor')) {
    result.filters.type = 'human'
  }

  // Relationship detection
  if (lower.includes('violation') || lower.includes('violat')) {
    result.relationship = 'violation'
  } else if (lower.includes('entitlement') || lower.includes('permission') || lower.includes('access')) {
    result.relationship = 'entitlement'
  } else if (lower.includes('group') || lower.includes('member')) {
    result.relationship = 'membership'
  } else if (lower.includes('manage') || lower.includes('report')) {
    result.relationship = 'manager'
  } else if (lower.includes('own')) {
    result.relationship = 'owner'
  }

  // Risk level
  if (lower.includes('critical risk') || lower.includes('critical')) {
    result.filters.riskLevel = 'critical'
  } else if (lower.includes('high risk') || lower.includes('high')) {
    result.filters.riskLevel = 'high'
  }

  // Tier violation
  if (lower.includes('tier violation') || lower.includes('tier breach')) {
    result.filters.tierViolation = 'true'
  }

  // Target type detection (after relationship)
  if (lower.includes('resource')) {
    result.targetType = 'Resource'
  } else if (lower.includes('group')) {
    result.targetType = 'Group'
  }

  return result
}

/**
 * Top-level parser: detects whether input is Cypher or natural language
 * and dispatches accordingly.
 */
export function parseGraphQuery(query: string): GraphQuery {
  const trimmed = query.trim()
  if (!trimmed) return { ...DEFAULT_QUERY }

  // If it looks like Cypher (starts with MATCH), parse as Cypher
  if (/^\s*MATCH\s/i.test(trimmed)) {
    return parseCypherQuery(trimmed)
  }

  // Otherwise treat as natural language
  return parseNaturalLanguageQuery(trimmed)
}

// ── Helpers ──

function normalizeNodeType(raw: string): 'Identity' | 'Resource' | 'Group' {
  const lower = raw.toLowerCase()
  if (lower === 'resource') return 'Resource'
  if (lower === 'group') return 'Group'
  return 'Identity'
}

function normalizeRelationship(raw: string): GraphQuery['relationship'] {
  const lower = raw.toLowerCase().replace(/_/g, '')
  if (lower.includes('entitlement') || lower === 'hasentitlement') return 'entitlement'
  if (lower.includes('member') || lower === 'memberof') return 'membership'
  if (lower.includes('manage')) return 'manager'
  if (lower.includes('own')) return 'owner'
  if (lower.includes('violat')) return 'violation'
  return 'entitlement'
}

function parseInlineProps(propsStr: string, filters: Record<string, string | number | boolean>) {
  // Parse key: "value" or key: value pairs
  const propPattern = /(\w+)\s*:\s*["']([^"']*)["']|(\w+)\s*:\s*(\w+)/g
  let match
  while ((match = propPattern.exec(propsStr)) !== null) {
    const key = match[1] || match[3]
    const value = match[2] ?? match[4]
    filters[camelCase(key)] = value
  }
}

function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}
