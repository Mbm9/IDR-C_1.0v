import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { probeAI, resolveAIConfig, type AIProbeResult } from '@/lib/ai/client'

// Never prerender: a health check must query the database on every request.
// Without this, a build that can reach the database caches "healthy" forever.
export const dynamic = 'force-dynamic'

const APP_VERSION = process.env.npm_package_version || '1.0.0'
const startTime = Date.now()

type CheckStatus = 'up' | 'down' | 'unconfigured'

interface HealthCheck {
  status: CheckStatus
  latencyMs?: number
  provider?: string
  model?: string
  detail?: string
  /** AI_PROVIDER as configured ('auto' when unset). */
  setting?: string
  providers?: AIProbeResult['providers']
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  uptime: number
  timestamp: string
  checks: {
    database: HealthCheck
    ai: HealthCheck
  }
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    return { status: 'up', latencyMs: Date.now() - start }
  } catch {
    return { status: 'down', latencyMs: Date.now() - start }
  }
}

/**
 * Probe the configured AI provider chain (Ollama GET /api/tags, Anthropic
 * GET /v1/models, OpenAI-compatible GET /models) with a short timeout. The
 * result is cached for ~30s in lib/ai/client so health polling stays cheap.
 * Merely having OLLAMA_URL set no longer counts as "up".
 */
async function checkAI(): Promise<HealthCheck> {
  const config = resolveAIConfig()
  try {
    const probe = await probeAI(config)
    return { ...probe, setting: config.setting }
  } catch {
    return { status: 'down', setting: config.setting, detail: 'probe failed' }
  }
}

export async function GET() {
  const [dbCheck, aiCheck] = await Promise.all([
    checkDatabase(),
    checkAI(),
  ])

  // The database decides healthy/unhealthy (503). AI is optional: a configured
  // provider that is unreachable only degrades; AI_PROVIDER=none is healthy.
  const isHealthy = dbCheck.status === 'up'
  const isDegraded = dbCheck.status === 'up' && aiCheck.status === 'down'

  let overallStatus: HealthResponse['status'] = 'healthy'
  if (!isHealthy) {
    overallStatus = 'unhealthy'
  } else if (isDegraded) {
    overallStatus = 'degraded'
  }

  const response: HealthResponse = {
    status: overallStatus,
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: {
      database: dbCheck,
      ai: aiCheck,
    },
  }

  return NextResponse.json(response, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
  })
}
