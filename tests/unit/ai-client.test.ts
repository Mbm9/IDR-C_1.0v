import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveAIConfig,
  generate,
  generateJSON,
  extractJSON,
  probeAI,
  aiMeta,
  isAIEnabled,
  resetAIClientState,
  PROBE_CACHE_MS,
} from '@/lib/ai/client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const ollamaReply = (content: string) => jsonResponse({ message: { role: 'assistant', content } })
const anthropicReply = (text: string) => jsonResponse({ content: [{ type: 'text', text }] })

describe('lib/ai/client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetAIClientState()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('resolveAIConfig (provider selection)', () => {
    it('AI_PROVIDER=none disables every provider, even with keys set', () => {
      const cfg = resolveAIConfig({ AI_PROVIDER: 'none', OLLAMA_URL: 'http://ollama:11434', ANTHROPIC_API_KEY: 'k' })
      expect(cfg.setting).toBe('none')
      expect(cfg.providers).toEqual([])
    })

    it('unset AI_PROVIDER uses Ollama on the default URL/model', () => {
      const cfg = resolveAIConfig({})
      expect(cfg.setting).toBe('auto')
      expect(cfg.providers).toHaveLength(1)
      expect(cfg.providers[0]).toMatchObject({ name: 'ollama', url: 'http://localhost:11434', model: 'qwen2.5:7b' })
    })

    it('ollama/local use OLLAMA_URL + OLLAMA_MODEL and fall back to Anthropic when a key is set', () => {
      for (const setting of ['ollama', 'local']) {
        const cfg = resolveAIConfig({
          AI_PROVIDER: setting,
          OLLAMA_URL: 'http://ollama:11434/',
          OLLAMA_MODEL: 'qwen2.5:1.5b',
          ANTHROPIC_API_KEY: 'sk-test',
          ANTHROPIC_MODEL: 'claude-test',
        })
        expect(cfg.providers.map((p) => p.name)).toEqual(['ollama', 'anthropic'])
        expect(cfg.providers[0]).toMatchObject({ url: 'http://ollama:11434', model: 'qwen2.5:1.5b' })
        expect(cfg.providers[1]).toMatchObject({ model: 'claude-test', apiKey: 'sk-test' })
      }
    })

    it('anthropic without a key and without OLLAMA_URL has no providers', () => {
      expect(resolveAIConfig({ AI_PROVIDER: 'anthropic' }).providers).toEqual([])
      const cfg = resolveAIConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', OLLAMA_URL: 'http://o:11434' })
      expect(cfg.providers.map((p) => p.name)).toEqual(['anthropic', 'ollama'])
    })

    it('docker_model_runner uses the OpenAI-compatible AI_MODEL_ENDPOINT', () => {
      const cfg = resolveAIConfig({
        AI_PROVIDER: 'docker_model_runner',
        AI_MODEL_ENDPOINT: 'http://host:12434/engines/x/v1/chat/completions',
      })
      expect(cfg.providers).toHaveLength(1)
      expect(cfg.providers[0]).toMatchObject({ name: 'openai_compatible', url: 'http://host:12434/engines/x/v1/chat/completions' })
    })

    it('treats empty strings (docker compose defaults) as unset', () => {
      const cfg = resolveAIConfig({ AI_PROVIDER: '', OLLAMA_URL: '', ANTHROPIC_API_KEY: '' })
      expect(cfg.providers.map((p) => p.name)).toEqual(['ollama'])
    })
  })

  describe('AI_PROVIDER=none', () => {
    it('makes no network call and reports a deterministic fallback', async () => {
      vi.stubEnv('AI_PROVIDER', 'none')
      expect(isAIEnabled()).toBe(false)

      const result = await generateJSON({ prompt: 'hello' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('disabled')
      expect(aiMeta(result)).toEqual({ generatedBy: 'deterministic', provider: 'fallback', model: null })

      const probe = await probeAI()
      expect(probe.status).toBe('unconfigured')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('generate / generateJSON', () => {
    const cfg = () => resolveAIConfig({ AI_PROVIDER: 'ollama', OLLAMA_URL: 'http://ollama:11434', OLLAMA_MODEL: 'm1', ANTHROPIC_API_KEY: 'sk', ANTHROPIC_MODEL: 'claude-x' })

    it('calls Ollama /api/chat in JSON mode and labels the result with provider + model', async () => {
      fetchMock.mockResolvedValueOnce(ollamaReply('{"answer":"42"}'))
      const result = await generateJSON({ system: 'sys', prompt: 'q', temperature: 0.1, maxTokens: 64 }, undefined, cfg())

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toEqual({ answer: '42' })
        expect(result.provider).toBe('ollama')
        expect(result.model).toBe('m1')
      }
      expect(aiMeta(result)).toEqual({ generatedBy: 'ai', provider: 'ollama', model: 'm1' })

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('http://ollama:11434/api/chat')
      const body = JSON.parse(init.body)
      expect(body).toMatchObject({ model: 'm1', stream: false, format: 'json', options: { temperature: 0.1, num_predict: 64 } })
      expect(body.messages).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'q' }])
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })

    it('falls back to Anthropic when Ollama is unreachable, then skips Ollama during the cool-down', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(anthropicReply('```json\n{"answer":"from claude"}\n```'))
        .mockResolvedValueOnce(anthropicReply('{"answer":"again"}'))

      const first = await generateJSON({ prompt: 'q' }, undefined, cfg())
      expect(first.ok && first.provider).toBe('anthropic')
      expect(first.ok && first.data).toEqual({ answer: 'from claude' })
      const [anthropicUrl, anthropicInit] = fetchMock.mock.calls[1]
      expect(anthropicUrl).toBe('https://api.anthropic.com/v1/messages')
      expect(anthropicInit.headers['x-api-key']).toBe('sk')
      expect(anthropicInit.headers['anthropic-version']).toBe('2023-06-01')

      const second = await generateJSON({ prompt: 'q' }, undefined, cfg())
      expect(second.ok && second.provider).toBe('anthropic')
      expect(second.attempts[0]).toMatchObject({ provider: 'ollama', outcome: 'skipped' })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('times out a hung provider and returns a deterministic fallback result', async () => {
      fetchMock.mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal!.reason ?? new DOMException('aborted', 'AbortError')))
        }),
      )
      const onlyOllama = resolveAIConfig({ AI_PROVIDER: 'ollama', OLLAMA_URL: 'http://slow:11434' })
      const started = Date.now()
      const result = await generateJSON({ prompt: 'q', timeoutMs: 30 }, undefined, onlyOllama)

      expect(Date.now() - started).toBeLessThan(2000)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('failed')
      expect(result.attempts).toEqual([expect.objectContaining({ provider: 'ollama', outcome: 'timeout' })])
      expect(aiMeta(result).generatedBy).toBe('deterministic')

      // A deterministic fallback in the caller is what the user then sees.
      const output = result.ok ? result.data : { answer: 'fallback' }
      expect(output).toEqual({ answer: 'fallback' })
    })

    it('moves to the next provider when the answer fails validation, without a cool-down on HTTP errors', async () => {
      fetchMock
        .mockResolvedValueOnce(ollamaReply('{"unexpected":true}'))
        .mockResolvedValueOnce(anthropicReply('{"answer":"ok"}'))
        .mockResolvedValueOnce(new Response('boom', { status: 500 }))
        .mockResolvedValueOnce(anthropicReply('{"answer":"ok2"}'))

      const validate = (p: any) => (p?.answer ? p : null)
      const first = await generateJSON({ prompt: 'q' }, validate, cfg())
      expect(first.attempts.map((a) => a.outcome)).toEqual(['unparseable', 'ok'])

      const second = await generateJSON({ prompt: 'q' }, validate, cfg())
      expect(second.attempts.map((a) => a.outcome)).toEqual(['http_error', 'ok'])
      expect(second.attempts[0].status).toBe(500)

      // HTTP 500 is not a network failure, so Ollama is tried again next time.
      fetchMock.mockResolvedValueOnce(ollamaReply('{"answer":"back"}'))
      const third = await generateJSON({ prompt: 'q' }, validate, cfg())
      expect(third.ok && third.provider).toBe('ollama')
    })

    it('generate() passes raw text to the parser (non-JSON prompts)', async () => {
      fetchMock.mockResolvedValueOnce(ollamaReply('plain narrative'))
      const result = await generate({ prompt: 'q' }, (t) => t.toUpperCase(), cfg())
      expect(result.ok && result.data).toBe('PLAIN NARRATIVE')
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).format).toBeUndefined()
    })

    it('sends OpenAI-compatible requests for docker_model_runner', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '{"a":1}' } }] }))
      const dmr = resolveAIConfig({ AI_PROVIDER: 'docker_model_runner', AI_MODEL_ENDPOINT: 'http://h:12434/v1/chat/completions', AI_MODEL: 'ai/x' })
      const result = await generateJSON({ prompt: 'q' }, undefined, dmr)
      expect(result.ok && result.data).toEqual({ a: 1 })
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('http://h:12434/v1/chat/completions')
      expect(JSON.parse(init.body)).toMatchObject({ model: 'ai/x', response_format: { type: 'json_object' } })
    })
  })

  describe('extractJSON', () => {
    it('parses direct JSON, fenced JSON and embedded objects', () => {
      expect(extractJSON('{"a":1}')).toEqual({ a: 1 })
      expect(extractJSON('Here:\n```json\n{"b":2}\n```')).toEqual({ b: 2 })
      expect(extractJSON('Sure! {"c":3} hope that helps')).toEqual({ c: 3 })
      expect(extractJSON('[1,2]')).toEqual([1, 2])
      expect(extractJSON('not json')).toBeNull()
      expect(extractJSON('')).toBeNull()
    })
  })

  describe('probeAI (health)', () => {
    const cfg = () => resolveAIConfig({ AI_PROVIDER: 'ollama', OLLAMA_URL: 'http://ollama:11434', OLLAMA_MODEL: 'qwen2.5:1.5b' })

    it('reports up when Ollama lists the configured model, and caches the result', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: 'qwen2.5:1.5b' }] }))
      const now = Date.now()
      const first = await probeAI(cfg(), now)
      expect(first).toMatchObject({ status: 'up', provider: 'ollama', model: 'qwen2.5:1.5b' })
      expect(fetchMock.mock.calls[0][0]).toBe('http://ollama:11434/api/tags')

      await probeAI(cfg(), now + 1000)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await probeAI(cfg(), now + PROBE_CACHE_MS + 1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('reports down when the model is not pulled', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: 'llama3:latest' }] }))
      const result = await probeAI(cfg())
      expect(result.status).toBe('down')
      expect(result.detail).toMatch(/not pulled/)
    })

    it('reports down when Ollama is unreachable even though OLLAMA_URL is set', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))
      const result = await probeAI(cfg())
      expect(result).toMatchObject({ status: 'down', provider: 'ollama', detail: 'unreachable' })
    })

    it('reports up via the Anthropic fallback when Ollama is down', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('11434')) throw new TypeError('fetch failed')
        return jsonResponse({ data: [] })
      })
      const result = await probeAI(resolveAIConfig({ AI_PROVIDER: 'ollama', OLLAMA_URL: 'http://ollama:11434', ANTHROPIC_API_KEY: 'k' }))
      expect(result).toMatchObject({ status: 'up', provider: 'anthropic' })
      expect(result.providers?.map((p) => p.status)).toEqual(['down', 'up'])
    })
  })
})
