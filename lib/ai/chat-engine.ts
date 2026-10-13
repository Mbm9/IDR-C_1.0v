import { db } from '@/lib/db'
import {
  identities, policyViolations, entitlements, accounts,
  groups, groupMemberships, resources, attackPaths,
  identityThreats, shadowAdmins,
} from '@/lib/db/schema'
import { eq, and, desc, count, sql, ilike, gte, lte, or } from 'drizzle-orm'
import { CHAT_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { parseNaturalLanguageQuery } from '@/lib/graph/query-parser'
import { generate, extractJSON } from '@/lib/ai/client'

export interface ChatResponse {
  answer: string
  data?: any
  suggestedActions?: string[]
  followUpQuestions: string[]
  /** 'ai' when a model wrote the answer (show it as a recommendation), else 'deterministic'. */
  generatedBy?: 'ai' | 'deterministic'
  /** Model that produced the answer, when generatedBy is 'ai'. */
  model?: string
}

type Intent = 'query' | 'analysis' | 'action' | 'comparison' | 'simulation' | 'general'

/**
 * Detect the intent of a user message.
 */
function detectIntent(message: string): Intent {
  const lower = message.toLowerCase()

  // Action intents
  if (/\b(disable|revoke|remove|delete|block|suspend)\b/.test(lower)) return 'action'

  // Comparison intents
  if (/\b(compare|versus|vs\.?|difference between|side by side)\b/.test(lower)) return 'comparison'

  // Simulation intents
  if (/\b(what if|simulate|if we|impact of|would happen)\b/.test(lower)) return 'simulation'

  // Query intents — questions about data
  if (/\b(who|which|how many|list|show|find|get|count|what are|where)\b/.test(lower)) return 'query'

  // Analysis intents
  if (/\b(why|explain|analyze|assess|risk|investigate|tell me about)\b/.test(lower)) return 'analysis'

  return 'general'
}

/**
 * Execute a database query based on parsed natural language.
 */
async function executeQuery(message: string, orgId: string): Promise<{ data: any; summary: string }> {
  const lower = message.toLowerCase()
  const parsed = parseNaturalLanguageQuery(message)

  // Count queries
  if (/how many|count|total/i.test(lower)) {
    const conditions: any[] = [eq(identities.orgId, orgId)]

    if (parsed.filters.type) conditions.push(eq(identities.type, parsed.filters.type as any))
    if (parsed.filters.adTier) conditions.push(eq(identities.adTier, parsed.filters.adTier as any))
    if (parsed.filters.status) conditions.push(eq(identities.status, parsed.filters.status as any))
    if (parsed.filters.tierViolation === 'true') conditions.push(eq(identities.tierViolation, true))

    const [result] = await db.select({ count: count() })
      .from(identities)
      .where(and(...conditions))

    const total = Number(result?.count ?? 0)
    return {
      data: { count: total },
      summary: `Found ${total} identities matching your criteria.`,
    }
  }

  // Domain Admin / privileged access queries
  if (/domain admin|DA access|privileged/i.test(lower)) {
    const rows = await db.select({
      id: identities.id,
      displayName: identities.displayName,
      type: identities.type,
      subType: identities.subType,
      adTier: identities.adTier,
      effectiveTier: identities.effectiveTier,
      tierViolation: identities.tierViolation,
      riskScore: identities.riskScore,
      status: identities.status,
      lastLogonAt: identities.lastLogonAt,
    })
      .from(identities)
      .innerJoin(entitlements, eq(entitlements.identityId, identities.id))
      .where(and(
        eq(identities.orgId, orgId),
        or(
          ilike(entitlements.permissionName, '%Domain Admin%'),
          ilike(entitlements.permissionName, '%Enterprise Admin%'),
          ilike(entitlements.permissionName, '%Schema Admin%'),
          eq(entitlements.adTierOfPermission, 'tier_0'),
        ),
      ))
      .groupBy(identities.id)
      .orderBy(desc(identities.riskScore))
      .limit(20)

    return {
      data: rows,
      summary: `Found ${rows.length} identities with Domain Admin or equivalent privileged access.`,
    }
  }

  // Violation queries
  if (/violation|breach|non.?complian/i.test(lower)) {
    const rows = await db.select({
      id: policyViolations.id,
      violationType: policyViolations.violationType,
      severity: policyViolations.severity,
      status: policyViolations.status,
      detectedAt: policyViolations.detectedAt,
      identityName: identities.displayName,
      identityId: identities.id,
      identityTier: identities.adTier,
    })
      .from(policyViolations)
      .innerJoin(identities, eq(policyViolations.identityId, identities.id))
      .where(and(
        eq(policyViolations.orgId, orgId),
        eq(policyViolations.status, 'open'),
      ))
      .orderBy(desc(policyViolations.severity))
      .limit(20)

    return {
      data: rows,
      summary: `Found ${rows.length} open policy violations.`,
    }
  }

  // Dormant / inactive queries
  if (/dormant|inactive|hasn.*logged|no login|not logged/i.test(lower)) {
    const daysMatch = lower.match(/(\d+)\s*days?/)
    const thresholdDays = daysMatch ? parseInt(daysMatch[1]) : 30
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - thresholdDays)

    const rows = await db.select({
      id: identities.id,
      displayName: identities.displayName,
      type: identities.type,
      subType: identities.subType,
      adTier: identities.adTier,
      riskScore: identities.riskScore,
      status: identities.status,
      lastLogonAt: identities.lastLogonAt,
    })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.status, 'active'),
        lte(identities.lastLogonAt, cutoff),
      ))
      .orderBy(desc(identities.riskScore))
      .limit(20)

    return {
      data: rows,
      summary: `Found ${rows.length} active identities that haven't logged in for ${thresholdDays}+ days.`,
    }
  }

  // Orphaned NHI queries
  if (/orphan|no owner|unowned/i.test(lower)) {
    const rows = await db.select({
      id: identities.id,
      displayName: identities.displayName,
      subType: identities.subType,
      adTier: identities.adTier,
      riskScore: identities.riskScore,
      status: identities.status,
      lastLogonAt: identities.lastLogonAt,
    })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.type, 'non_human'),
        sql`${identities.ownerIdentityId} IS NULL`,
      ))
      .orderBy(desc(identities.riskScore))
      .limit(20)

    return {
      data: rows,
      summary: `Found ${rows.length} orphaned non-human identities without an owner.`,
    }
  }

  // Tier violation queries
  if (/tier.*violation|cross.*tier|tier.*breach/i.test(lower)) {
    const rows = await db.select({
      id: identities.id,
      displayName: identities.displayName,
      type: identities.type,
      adTier: identities.adTier,
      effectiveTier: identities.effectiveTier,
      riskScore: identities.riskScore,
      status: identities.status,
    })
      .from(identities)
      .where(and(
        eq(identities.orgId, orgId),
        eq(identities.tierViolation, true),
      ))
      .orderBy(desc(identities.riskScore))
      .limit(20)

    return {
      data: rows,
      summary: `Found ${rows.length} identities with tier violations.`,
    }
  }

  // Attack path queries
  if (/attack.*path|escalation.*path|path.*to/i.test(lower)) {
    const rows = await db.select({
      id: attackPaths.id,
      sourceIdentityName: identities.displayName,
      targetResourceName: resources.name,
      pathLength: attackPaths.pathLength,
      riskScore: attackPaths.riskScore,
      technique: attackPaths.attackTechnique,
    })
      .from(attackPaths)
      .innerJoin(identities, eq(attackPaths.sourceIdentityId, identities.id))
      .innerJoin(resources, eq(attackPaths.targetResourceId, resources.id))
      .where(eq(attackPaths.orgId, orgId))
      .orderBy(desc(attackPaths.riskScore))
      .limit(10)

    return {
      data: rows,
      summary: `Found ${rows.length} attack paths in your environment.`,
    }
  }

  // Shadow admin queries
  if (/shadow.*admin/i.test(lower)) {
    const rows = await db.select({
      id: shadowAdmins.id,
      identityName: identities.displayName,
      detectionMethod: shadowAdmins.detectionMethod,
      effectiveRights: shadowAdmins.effectiveRights,
      riskScore: shadowAdmins.riskScore,
      status: shadowAdmins.status,
    })
      .from(shadowAdmins)
      .innerJoin(identities, eq(shadowAdmins.identityId, identities.id))
      .where(eq(shadowAdmins.orgId, orgId))
      .orderBy(desc(shadowAdmins.riskScore))
      .limit(20)

    return {
      data: rows,
      summary: `Found ${rows.length} shadow admins in your environment.`,
    }
  }

  // Default: search identities by name or general filter
  const conditions: any[] = [eq(identities.orgId, orgId)]
  if (parsed.filters.type) conditions.push(eq(identities.type, parsed.filters.type as any))
  if (parsed.filters.adTier) conditions.push(eq(identities.adTier, parsed.filters.adTier as any))
  if (parsed.filters.status) conditions.push(eq(identities.status, parsed.filters.status as any))
  if (parsed.filters.subType) conditions.push(eq(identities.subType, parsed.filters.subType as any))
  if (parsed.filters.tierViolation === 'true') conditions.push(eq(identities.tierViolation, true))

  // Extract potential name search
  const nameMatch = lower.match(/(?:named?|called)\s+["']?(\w[\w\s-]+)["']?/i)
  if (nameMatch) {
    conditions.push(ilike(identities.displayName, `%${nameMatch[1].trim()}%`))
  }

  const rows = await db.select({
    id: identities.id,
    displayName: identities.displayName,
    type: identities.type,
    subType: identities.subType,
    adTier: identities.adTier,
    effectiveTier: identities.effectiveTier,
    tierViolation: identities.tierViolation,
    riskScore: identities.riskScore,
    status: identities.status,
    lastLogonAt: identities.lastLogonAt,
  })
    .from(identities)
    .where(and(...conditions))
    .orderBy(desc(identities.riskScore))
    .limit(20)

  return {
    data: rows,
    summary: `Found ${rows.length} identities matching your query.`,
  }
}

/**
 * Build context for AI analysis of a specific topic.
 */
async function buildAnalysisContext(message: string, orgId: string): Promise<string> {
  const [
    identityStats,
    violationStats,
    topRisky,
  ] = await Promise.all([
    db.select({ type: identities.type, tier: identities.adTier, count: count() })
      .from(identities).where(eq(identities.orgId, orgId))
      .groupBy(identities.type, identities.adTier),
    db.select({ type: policyViolations.violationType, count: count() })
      .from(policyViolations)
      .where(and(eq(policyViolations.orgId, orgId), eq(policyViolations.status, 'open')))
      .groupBy(policyViolations.violationType),
    db.select({
      name: identities.displayName,
      tier: identities.adTier,
      risk: identities.riskScore,
      tierViolation: identities.tierViolation,
    })
      .from(identities)
      .where(eq(identities.orgId, orgId))
      .orderBy(desc(identities.riskScore))
      .limit(10),
  ])

  const statsStr = identityStats.map(s => `${s.type}/${s.tier}: ${s.count}`).join(', ')
  const violStr = violationStats.map(v => `${v.type}: ${v.count}`).join(', ')
  const topStr = topRisky.map(i => `${i.name}(risk:${i.risk},tier:${i.tier}${i.tierViolation ? ',VIOLATION' : ''})`).join(', ')

  return `Context: Identities by type/tier: ${statsStr}. Open violations: ${violStr}. Top risky: ${topStr}. User question: ${message}`
}

/**
 * Call AI through the shared provider chain (Ollama -> Anthropic). Returns null
 * when no provider produced a usable answer; the caller then falls back.
 */
async function callAI(systemPrompt: string, userPrompt: string): Promise<ChatResponse | null> {
  const result = await generate(
    {
      label: 'chat',
      system: systemPrompt,
      prompt: userPrompt,
      json: true,
      temperature: 0.3,
      maxTokens: 1024,
      timeoutMs: 60_000,
    },
    parseChatResponse,
  )
  if (!result.ok) return null
  return { ...result.data, generatedBy: 'ai', model: result.model }
}

function parseChatResponse(text: string): ChatResponse | null {
  const parsed = extractJSON(text)
  if (parsed && typeof parsed === 'object' && parsed.answer) return parsed
  if (parsed) return null
  // If text is non-empty but not JSON, wrap it
  if (text.trim()) {
    return {
      answer: text.trim(),
      followUpQuestions: [],
    }
  }
  return null
}

/**
 * Generate a fallback response when AI is unavailable.
 */
function generateFallbackResponse(intent: Intent, queryResult?: { data: any; summary: string }): ChatResponse {
  if (queryResult) {
    const dataLength = Array.isArray(queryResult.data) ? queryResult.data.length : 1
    return {
      answer: queryResult.summary,
      data: queryResult.data,
      suggestedActions: dataLength > 0 ? ['View details for these identities', 'Export this list', 'Generate remediation plan'] : undefined,
      followUpQuestions: [
        'Which of these have tier violations?',
        'Show me their entitlements',
        'What is the risk trend for these identities?',
      ],
    }
  }

  return {
    answer: 'I can help you analyze your IAM posture. Try asking about specific identities, violations, tier compliance, or attack paths.',
    followUpQuestions: [
      'Who has Domain Admin access?',
      'Show me all tier violations',
      'How many orphaned service accounts do we have?',
      'What are the top risks right now?',
    ],
  }
}

/**
 * Main chat processing function.
 */
export async function processChat(
  message: string,
  orgId: string,
  userId: string,
): Promise<ChatResponse> {
  const response = await answerChat(message, orgId, userId)
  return { ...response, generatedBy: response.generatedBy ?? 'deterministic' }
}

async function answerChat(
  message: string,
  orgId: string,
  _userId: string,
): Promise<ChatResponse> {
  const intent = detectIntent(message)

  switch (intent) {
    case 'query': {
      const queryResult = await executeQuery(message, orgId)
      // Try AI to provide a richer narrative
      const aiResponse = await callAI(
        CHAT_SYSTEM_PROMPT,
        `User asked: "${message}"\n\nQuery results (${Array.isArray(queryResult.data) ? queryResult.data.length : 1} results): ${JSON.stringify(queryResult.data).slice(0, 2000)}\n\nProvide a concise answer summarizing the data. Include suggestedActions and followUpQuestions.`,
      )

      if (aiResponse) {
        return {
          ...aiResponse,
          data: queryResult.data,
        }
      }

      return generateFallbackResponse(intent, queryResult)
    }

    case 'analysis': {
      const context = await buildAnalysisContext(message, orgId)
      const aiResponse = await callAI(CHAT_SYSTEM_PROMPT, context)
      if (aiResponse) return aiResponse
      return generateFallbackResponse(intent)
    }

    case 'action': {
      // For actions, return confirmation prompt rather than executing
      return {
        answer: `I understand you want to perform an action. For safety, actions must be confirmed through the appropriate dashboard page. Here's what I detected:\n\n**Requested action:** ${message}\n\nPlease navigate to the relevant identity or violation page to execute this action with proper authorization.`,
        suggestedActions: ['Go to Identity Explorer', 'Go to Violations Dashboard'],
        followUpQuestions: [
          'Show me the identity you want to modify',
          'What violations are associated with this identity?',
        ],
      }
    }

    case 'comparison': {
      const context = await buildAnalysisContext(message, orgId)
      const aiResponse = await callAI(CHAT_SYSTEM_PROMPT, context)
      if (aiResponse) return aiResponse
      return {
        answer: 'To compare identities, please specify two identity names. For example: "Compare admin-jdoe and svc-backup".',
        followUpQuestions: [
          'Who are the riskiest identities?',
          'Show me tier 0 identities',
        ],
      }
    }

    case 'simulation': {
      const context = await buildAnalysisContext(message, orgId)
      const aiResponse = await callAI(
        CHAT_SYSTEM_PROMPT,
        `${context}\n\nThe user wants a simulation/what-if analysis. Estimate the impact of the proposed change.`,
      )
      if (aiResponse) return aiResponse
      return {
        answer: 'Posture simulations require AI analysis. Please ensure an AI provider (Ollama or Anthropic) is configured to use this feature.',
        followUpQuestions: [
          'Show me current tier violations',
          'What are the quick wins for risk reduction?',
        ],
      }
    }

    default: {
      // General / conversational
      const aiResponse = await callAI(
        CHAT_SYSTEM_PROMPT,
        `User message: "${message}"\n\nProvide a helpful response about IAM posture management. Include followUpQuestions.`,
      )
      if (aiResponse) return aiResponse
      return generateFallbackResponse(intent)
    }
  }
}
