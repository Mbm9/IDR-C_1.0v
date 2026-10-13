import { encryptCredentials } from '@/lib/crypto/credentials'
import { validateConnectorConfig } from '@/lib/connectors/url-guard'

/** Raised when a connector config cannot be stored; the message is safe to return to the client. */
export class ConnectorConfigError extends Error {
  constructor(message: string, readonly status: 400 | 500) {
    super(message)
  }
}

/**
 * Prepare a connector config for the `integration_sources.config` column.
 *
 * Every write path (integrations API, onboarding) goes through here so the
 * SSRF guard and credential encryption cannot be skipped. Without a usable
 * CREDENTIALS_KEY the config is refused in production; in development it is
 * stored as-is with a warning.
 */
export function prepareConnectorConfig(config: unknown): Record<string, unknown> | string {
  try {
    validateConnectorConfig(config)
  } catch (e: any) {
    throw new ConnectorConfigError(e?.message || 'Invalid connector endpoint', 400)
  }

  if (!config || typeof config !== 'object' || Object.keys(config).length === 0) return {}
  const plain = config as Record<string, unknown>

  try {
    return encryptCredentials(plain)
  } catch (e: any) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[integrations] Refusing to store connector credentials:', e?.message)
      throw new ConnectorConfigError(
        'Credential encryption is not configured. Set CREDENTIALS_KEY (64 hex characters) and restart.',
        500,
      )
    }
    console.warn('[integrations] CREDENTIALS_KEY not set — storing credentials unencrypted (development only)')
    return plain
  }
}
