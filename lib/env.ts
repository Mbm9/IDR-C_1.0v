/**
 * Environment Variable Validation
 *
 * Validates all required environment variables at startup using Zod.
 * Import this module early in the application to fail fast with clear
 * error messages when required configuration is missing.
 */

import { z } from 'zod'

/** Values shipped in compose defaults and .env templates; never valid secrets. */
const PLACEHOLDER_SECRETS = new Set([
  'identity-radar-secret-key-change-in-production',
  'generate-a-random-secret-here',
])

const envSchema = z.object({
  // Database (required)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').url('DATABASE_URL must be a valid URL'),

  // Auth (required)
  NEXTAUTH_SECRET: z
    .string()
    .min(16, 'NEXTAUTH_SECRET must be at least 16 characters')
    .refine(
      (val) => !PLACEHOLDER_SECRETS.has(val) && !val.startsWith('CHANGE_ME'),
      'NEXTAUTH_SECRET is still using the default placeholder — generate a secure random secret'
    ),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL').optional(),
  AUTH_TRUST_HOST: z.string().optional(),

  // AI (optional — app works without AI via deterministic fallback)
  AI_PROVIDER: z.enum(['ollama', 'anthropic', 'none', 'local', 'docker_model_runner']).optional(),
  OLLAMA_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  AI_MODEL_ENDPOINT: z.string().url('AI_MODEL_ENDPOINT must be a valid URL').optional(),
  AI_MODEL: z.string().optional(),

  // Credential encryption (required in production)
  CREDENTIALS_KEY: z
    .string()
    .length(64, 'CREDENTIALS_KEY must be a 64-character hex string')
    .regex(/^[0-9a-fA-F]+$/, 'CREDENTIALS_KEY must be hexadecimal')
    .optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),

  // Cron security
  CRON_SECRET: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

/**
 * Validate environment variables. Call at app startup.
 * In development, warns about missing optional vars.
 * In production, throws on missing required vars.
 */
export function validateEnv(): Env {
  // Docker Compose passes unset variables as empty strings (`${VAR:-}`);
  // treat those as absent so optional fields validate.
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== '')
  )
  const result = envSchema.safeParse(raw)

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    const messages = Object.entries(errors)
      .map(([field, errs]) => `  ${field}: ${errs?.join(', ')}`)
      .join('\n')

    const isDev = process.env.NODE_ENV !== 'production'

    if (isDev) {
      console.warn(
        `⚠️  Environment variable validation warnings:\n${messages}\n` +
        'These will be errors in production.'
      )
      return process.env as unknown as Env
    }

    throw new Error(
      `❌ Environment variable validation failed:\n${messages}\n\n` +
      'Fix the above issues and restart the application.'
    )
  }

  return result.data
}

// Auto-validate on import (warns in dev, throws in prod)
let _env: Env | null = null
try {
  _env = validateEnv()
} catch (err) {
  // During build, env vars may not be available
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
    throw err
  }
}

export const env = _env
