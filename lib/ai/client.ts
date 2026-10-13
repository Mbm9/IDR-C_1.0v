/**
 * Shared AI client — the only module that talks to an LLM provider.
 *
 * Provider chain (from env):
 *   AI_PROVIDER=none                → no providers, never makes a network call
 *   AI_PROVIDER=ollama | local      → Ollama, then Anthropic if ANTHROPIC_API_KEY is set
 *   AI_PROVIDER=anthropic           → Anthropic (needs ANTHROPIC_API_KEY), then Ollama if OLLAMA_URL is set
 *   AI_PROVIDER=docker_model_runner → OpenAI-compatible AI_MODEL_ENDPOINT, then Anthropic if a key is set
 *   AI_PROVIDER unset               → Ollama (OLLAMA_URL or localhost), then Anthropic if a key is set
 *
 * Every call has a per-provider timeout (AbortSignal). A provider that fails at
 * the network level (refused, DNS, timeout) is skipped for a short cool-down so
 * batch jobs do not wait out a timeout per item while it is down.
 *
 * Callers pass a `parse` function that turns the raw model text into their
 * result shape (or null when the output is unusable); an unusable answer moves
 * on to the next provider. When no provider succeeds the result says so and
 * the caller applies its deterministic fallback. The AI never writes to the
 * database itself — callers decide what to persist and label it as AI output.
 */

export type AIProviderName = 'ollama' | 'anthropic' | 'openai_compatible'
export type AIProviderSetting = 'ollama' | 'anthropic' | 'none' | 'local' | 'docker_model_runner'
export type GeneratedBy = 'ai' | 'deterministic'

export interface AIProviderConfig {
  name: AIProviderName
  model: string
  /** Base URL (Ollama), full chat-completions URL (OpenAI-compatible) or API base (Anthropic). */
  url: string
  apiKey?: string
}

export interface AIConfig {
  /** The AI_PROVIDER value as configured ('auto' when unset). */
  setting: AIProviderSetting | 'auto'
  /** Ordered provider chain; empty means AI is disabled/unconfigured. */
  providers: AIProviderConfig[]
}

export interface AIRequest {
  system?: string
  prompt: string
  /** Ask the provider for a JSON object (Ollama `format: 'json'`, OpenAI `response_format`). */
  json?: boolean
  temperature?: number
  /** Max output tokens (Ollama num_predict / Anthropic max_tokens). */
  maxTokens?: number
  /** Per-provider timeout in milliseconds. */
  timeoutMs?: number
  /** Optional caller signal (e.g. request abort). */
  signal?: AbortSignal
  /** Short label for log lines. */
  label?: string
}

export interface AIAttempt {
  provider: AIProviderName
  model: string
  outcome: 'ok' | 'http_error' | 'network_error' | 'timeout' | 'unparseable' | 'skipped'
  status?: number
  latencyMs: number
}

export type AIResult<T> =
  | {
      ok: true
      data: T
      text: string
      provider: AIProviderName
      model: string
      generatedBy: 'ai'
      attempts: AIAttempt[]
    }
  | {
      ok: false
      data: null
      reason: 'disabled' | 'failed'
      generatedBy: 'deterministic'
      attempts: AIAttempt[]
    }

export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b'
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'
export const DEFAULT_DMR_MODEL = 'ai/qwen3.5:35B-Q4_K_M'
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'
/** How long a provider that failed at the network level is skipped. */
export const PROVIDER_COOLDOWN_MS = 30_000

type Env = Record<string, string | undefined>

function envValue(env: Env, key: string): string | undefined {
  const v = env[key]
  return v && v.trim() !== '' ? v.trim() : undefined
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

// ── Configuration ──

export function resolveAIConfig(env: Env = process.env): AIConfig {
  const raw = envValue(env, 'AI_PROVIDER')?.toLowerCase()
  const setting: AIConfig['setting'] =
    raw === 'ollama' || raw === 'anthropic' || raw === 'none' || raw === 'local' || raw === 'docker_model_runner'
      ? raw
      : 'auto'

  if (setting === 'none') return { setting, providers: [] }

  const ollamaUrlEnv = envValue(env, 'OLLAMA_URL')
  const anthropicKey = envValue(env, 'ANTHROPIC_API_KEY')

  const ollama: AIProviderConfig = {
    name: 'ollama',
    url: stripTrailingSlash(ollamaUrlEnv || DEFAULT_OLLAMA_URL),
    model: envValue(env, 'OLLAMA_MODEL') || DEFAULT_OLLAMA_MODEL,
  }
  const anthropic: AIProviderConfig | null = anthropicKey
    ? {
        name: 'anthropic',
        url: ANTHROPIC_BASE_URL,
        model: envValue(env, 'ANTHROPIC_MODEL') || DEFAULT_ANTHROPIC_MODEL,
        apiKey: anthropicKey,
      }
    : null

  const providers: AIProviderConfig[] = []
  switch (setting) {
    case 'anthropic':
      if (anthropic) providers.push(anthropic)
      if (ollamaUrlEnv) providers.push(ollama)
      break
    case 'docker_model_runner': {
      const endpoint = envValue(env, 'AI_MODEL_ENDPOINT')
      if (endpoint) {
        providers.push({
          name: 'openai_compatible',
          url: endpoint,
          model: envValue(env, 'AI_MODEL') || DEFAULT_DMR_MODEL,
        })
      }
      if (anthropic) providers.push(anthropic)
      break
    }
    default: // ollama, local, auto
      providers.push(ollama)
      if (anthropic) providers.push(anthropic)
  }

  return { setting, providers }
}

export function isAIEnabled(env: Env = process.env): boolean {
  return resolveAIConfig(env).providers.length > 0
}

// ── Circuit breaker ──

const cooldownUntil = new Map<string, number>()

function providerKey(p: AIProviderConfig): string {
  return `${p.name}|${p.url}`
}

export function markProviderDown(p: AIProviderConfig, now = Date.now()): void {
  cooldownUntil.set(providerKey(p), now + PROVIDER_COOLDOWN_MS)
}

function isCoolingDown(p: AIProviderConfig, now = Date.now()): boolean {
  const until = cooldownUntil.get(providerKey(p))
  if (!until) return false
  if (until <= now) {
    cooldownUntil.delete(providerKey(p))
    return false
  }
  return true
}

/** Test helper: clear cool-downs and the health probe cache. */
export function resetAIClientState(): void {
  cooldownUntil.clear()
  probeCache = null
}

// ── Signals ──

function buildSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (!external) return timeout
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (anyFn) return anyFn([timeout, external])
  // Older runtimes: forward the external abort manually.
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (external.aborted || timeout.aborted) controller.abort()
  external.addEventListener('abort', abort, { once: true })
  timeout.addEventListener('abort', abort, { once: true })
  return controller.signal
}

function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: string })?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

// ── Provider calls ──

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`)
  }
}

async function callProvider(p: AIProviderConfig, req: AIRequest, signal: AbortSignal): Promise<string> {
  const temperature = req.temperature ?? 0.3
  const maxTokens = req.maxTokens ?? 1024

  if (p.name === 'ollama') {
    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ]
    const res = await fetch(`${p.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        messages,
        stream: false,
        ...(req.json ? { format: 'json' } : {}),
        options: { temperature, num_predict: maxTokens },
      }),
      signal,
    })
    if (!res.ok) throw new HttpError(res.status)
    const body = await res.json()
    return String(body?.message?.content ?? '')
  }

  if (p.name === 'openai_compatible') {
    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ]
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: p.model,
        messages,
        stream: false,
        temperature,
        max_tokens: maxTokens,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    })
    if (!res.ok) throw new HttpError(res.status)
    const body = await res.json()
    return String(body?.choices?.[0]?.message?.content ?? '')
  }

  // Anthropic Messages API over plain fetch (no SDK dependency).
  const res = await fetch(`${p.url}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.apiKey ?? '',
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: Math.max(maxTokens, 1024),
      temperature,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: 'user', content: req.prompt }],
    }),
    signal,
  })
  if (!res.ok) throw new HttpError(res.status)
  const body = await res.json()
  const blocks: Array<{ type?: string; text?: string }> = Array.isArray(body?.content) ? body.content : []
  return blocks.filter((b) => b.type === 'text' || typeof b.text === 'string').map((b) => b.text ?? '').join('')
}

/**
 * Run a prompt through the provider chain. `parse` turns raw text into the
 * caller's result (return null to reject the answer and try the next provider).
 */
export async function generate<T>(
  req: AIRequest,
  parse: (text: string) => T | null,
  config: AIConfig = resolveAIConfig(),
): Promise<AIResult<T>> {
  const attempts: AIAttempt[] = []
  if (config.providers.length === 0) {
    return { ok: false, data: null, reason: 'disabled', generatedBy: 'deterministic', attempts }
  }

  const label = req.label ? `[AI:${req.label}]` : '[AI]'
  for (const p of config.providers) {
    if (isCoolingDown(p)) {
      attempts.push({ provider: p.name, model: p.model, outcome: 'skipped', latencyMs: 0 })
      continue
    }
    const start = Date.now()
    try {
      const text = await callProvider(p, req, buildSignal(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, req.signal))
      let data: T | null = null
      try {
        data = text.trim() ? parse(text) : null
      } catch {
        data = null
      }
      if (data !== null && data !== undefined) {
        attempts.push({ provider: p.name, model: p.model, outcome: 'ok', latencyMs: Date.now() - start })
        return { ok: true, data, text, provider: p.name, model: p.model, generatedBy: 'ai', attempts }
      }
      attempts.push({ provider: p.name, model: p.model, outcome: 'unparseable', latencyMs: Date.now() - start })
      console.warn(`${label} ${p.name} (${p.model}) returned an unusable response`)
    } catch (err) {
      const latencyMs = Date.now() - start
      if (err instanceof HttpError) {
        attempts.push({ provider: p.name, model: p.model, outcome: 'http_error', status: err.status, latencyMs })
        console.warn(`${label} ${p.name} (${p.model}) returned HTTP ${err.status}`)
      } else {
        // The caller aborted: stop without blaming the provider.
        if (req.signal?.aborted) {
          attempts.push({ provider: p.name, model: p.model, outcome: 'timeout', latencyMs })
          break
        }
        const outcome = isTimeoutError(err) ? 'timeout' : 'network_error'
        attempts.push({ provider: p.name, model: p.model, outcome, latencyMs })
        markProviderDown(p)
        console.warn(`${label} ${p.name} unavailable (${outcome}): ${(err as Error)?.message ?? err}`)
      }
    }
  }

  return { ok: false, data: null, reason: 'failed', generatedBy: 'deterministic', attempts }
}

// ── Parsing helpers ──

/**
 * Parse a JSON value from model output: direct JSON, or the first fenced
 * ```json block. Returns null when nothing parses.
 */
export function extractJSON(text: string): any | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) {
      try {
        return JSON.parse(fence[1])
      } catch {
        /* ignore */
      }
    }
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        /* ignore */
      }
    }
    return null
  }
}

/** JSON-mode convenience: requests JSON and validates the parsed value. */
export function generateJSON<T = any>(
  req: AIRequest,
  validate: (parsed: any) => T | null = (v) => (v && typeof v === 'object' ? (v as T) : null),
  config?: AIConfig,
): Promise<AIResult<T>> {
  return generate({ ...req, json: req.json ?? true }, (text) => {
    const parsed = extractJSON(text)
    return parsed === null ? null : validate(parsed)
  }, config)
}

/** Label fields to merge into an API response. */
export function aiMeta(result: AIResult<unknown>): {
  generatedBy: GeneratedBy
  provider: AIProviderName | 'fallback'
  model: string | null
} {
  return result.ok
    ? { generatedBy: 'ai', provider: result.provider, model: result.model }
    : { generatedBy: 'deterministic', provider: 'fallback', model: null }
}

// ── Health probe ──

export interface AIProbeResult {
  status: 'up' | 'down' | 'unconfigured'
  provider?: AIProviderName
  model?: string
  latencyMs?: number
  detail?: string
  providers?: Array<{ provider: AIProviderName; model: string; status: 'up' | 'down'; detail?: string; latencyMs: number }>
}

export const PROBE_CACHE_MS = 30_000
export const PROBE_TIMEOUT_MS = 2_000

let probeCache: { key: string; at: number; result: AIProbeResult } | null = null

function modelMatches(available: string[], wanted: string): boolean {
  const norm = (m: string) => (m.includes(':') ? m : `${m}:latest`)
  return available.some((m) => m === wanted || norm(m) === norm(wanted))
}

async function probeProvider(
  p: AIProviderConfig,
): Promise<{ status: 'up' | 'down'; detail?: string; latencyMs: number }> {
  const start = Date.now()
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS)
  try {
    if (p.name === 'ollama') {
      const res = await fetch(`${p.url}/api/tags`, { signal })
      if (!res.ok) return { status: 'down', detail: `HTTP ${res.status}`, latencyMs: Date.now() - start }
      const body = await res.json().catch(() => ({}))
      const names: string[] = Array.isArray(body?.models)
        ? body.models.map((m: { name?: string; model?: string }) => m.name || m.model || '').filter(Boolean)
        : []
      if (!modelMatches(names, p.model)) {
        return { status: 'down', detail: `model ${p.model} not pulled`, latencyMs: Date.now() - start }
      }
      return { status: 'up', latencyMs: Date.now() - start }
    }
    if (p.name === 'openai_compatible') {
      const modelsUrl = p.url.replace(/\/chat\/completions\/?$/, '/models')
      const res = await fetch(modelsUrl, { signal })
      return res.ok
        ? { status: 'up', latencyMs: Date.now() - start }
        : { status: 'down', detail: `HTTP ${res.status}`, latencyMs: Date.now() - start }
    }
    // Anthropic: list models (no tokens spent) to validate reachability + key.
    const res = await fetch(`${p.url}/v1/models?limit=1`, {
      headers: { 'x-api-key': p.apiKey ?? '', 'anthropic-version': ANTHROPIC_VERSION },
      signal,
    })
    return res.ok
      ? { status: 'up', latencyMs: Date.now() - start }
      : { status: 'down', detail: `HTTP ${res.status}`, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      status: 'down',
      detail: isTimeoutError(err) ? 'timeout' : 'unreachable',
      latencyMs: Date.now() - start,
    }
  }
}

/**
 * Cheap reachability check of the configured provider chain, cached for
 * PROBE_CACHE_MS. 'up' when any provider answers; reports the first one that does.
 */
export async function probeAI(config: AIConfig = resolveAIConfig(), now = Date.now()): Promise<AIProbeResult> {
  if (config.providers.length === 0) return { status: 'unconfigured' }

  const key = JSON.stringify(config.providers.map((p) => [p.name, p.url, p.model]))
  if (probeCache && probeCache.key === key && now - probeCache.at < PROBE_CACHE_MS) {
    return probeCache.result
  }

  const checks = await Promise.all(config.providers.map((p) => probeProvider(p)))
  const providers = config.providers.map((p, i) => ({ provider: p.name, model: p.model, ...checks[i] }))
  const firstUp = providers.find((c) => c.status === 'up')
  const primary = providers[0]
  const result: AIProbeResult = firstUp
    ? { status: 'up', provider: firstUp.provider, model: firstUp.model, latencyMs: firstUp.latencyMs, providers }
    : {
        status: 'down',
        provider: primary.provider,
        model: primary.model,
        latencyMs: primary.latencyMs,
        detail: primary.detail,
        providers,
      }

  probeCache = { key, at: now, result }
  return result
}
