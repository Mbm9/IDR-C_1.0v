import { describe, it, expect, vi, afterEach } from 'vitest'

describe('Environment Validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('warns in development for missing optional vars', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')
    vi.stubEnv('NEXTAUTH_SECRET', 'dev-secret-long-enough')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { validateEnv } = await import('@/lib/env')
    const result = validateEnv()

    // Should return env object even with warnings
    expect(result).toBeDefined()
    warnSpy.mockRestore()
  })

  it('rejects placeholder NEXTAUTH_SECRET in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')
    vi.stubEnv('NEXTAUTH_SECRET', 'identity-radar-secret-key-change-in-production')

    // lib/env auto-validates on import and re-throws in production, so the import itself rejects.
    vi.resetModules()
    await expect(import('@/lib/env')).rejects.toThrow('placeholder')
  })

  it('rejects short NEXTAUTH_SECRET in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')
    vi.stubEnv('NEXTAUTH_SECRET', 'short')

    vi.resetModules()
    await expect(import('@/lib/env')).rejects.toThrow('at least 16')
  })

  it('validates CREDENTIALS_KEY format when provided', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')
    vi.stubEnv('NEXTAUTH_SECRET', 'dev-secret-long-enough')
    vi.stubEnv('CREDENTIALS_KEY', 'not-hex-and-wrong-length')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { validateEnv } = await import('@/lib/env')
    validateEnv()

    // Should warn about invalid CREDENTIALS_KEY
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('accepts valid AI_PROVIDER values', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')
    vi.stubEnv('NEXTAUTH_SECRET', 'dev-secret-long-enough')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    for (const provider of ['ollama', 'anthropic', 'none', 'local', 'docker_model_runner']) {
      vi.stubEnv('AI_PROVIDER', provider)
      vi.resetModules()
      const { validateEnv } = await import('@/lib/env')
      expect(() => validateEnv()).not.toThrow()
    }

    warnSpy.mockRestore()
  })

  it('treats empty strings from compose (${VAR:-}) as unset in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')
    vi.stubEnv('NEXTAUTH_SECRET', 'a-real-secret-that-is-long-enough')
    vi.stubEnv('CREDENTIALS_KEY', '')
    vi.stubEnv('CRON_SECRET', '')

    vi.resetModules()
    const { validateEnv } = await import('@/lib/env')
    expect(() => validateEnv()).not.toThrow()
  })

  it('rejects .env template placeholders for NEXTAUTH_SECRET in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')
    vi.stubEnv('NEXTAUTH_SECRET', 'CHANGE_ME_run_openssl_rand_base64_32')

    vi.resetModules()
    await expect(import('@/lib/env')).rejects.toThrow('placeholder')
  })
})
