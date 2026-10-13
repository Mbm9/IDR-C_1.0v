import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

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

function checkAI(): HealthCheck {
  const aiProvider = process.env.AI_PROVIDER || ''
  const ollamaUrl = process.env.OLLAMA_URL || ''
  const anthropicKey = process.env.ANTHROPIC_API_KEY || ''
  const modelEndpoint = process.env.AI_MODEL_ENDPOINT || ''

  if (aiProvider === 'docker_model_runner' && modelEndpoint) {
    return { status: 'up', provider: 'docker_model_runner' }
  }

  if (ollamaUrl) {
    return { status: 'up', provider: 'ollama' }
  }

  if (anthropicKey) {
    return { status: 'up', provider: 'anthropic' }
  }

  return { status: 'unconfigured' }
}

export async function GET() {
  const [dbCheck, aiCheck] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkAI()),
  ])

  const isHealthy = dbCheck.status === 'up'
  const isDegraded = dbCheck.status === 'up' && aiCheck.status !== 'up'

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
