// Sync error summaries
// Turns a thrown connector/sync error into a short message that is safe to
// store in integration_sources.last_sync_error and show in the UI: no
// credentials, tokens, connection-string passwords or stack traces.

const MAX_LENGTH = 300

const REDACTIONS: Array<[RegExp, string]> = [
  // user:password@host in URLs / connection strings
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted]@'],
  // Authorization headers and bearer/basic tokens
  [/\b(bearer|basic|token|ssws)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  // key=value / key: value pairs for secret-looking keys (querystrings, JSON, logs)
  [/(["']?\b(?:password|passwd|pwd|secret|client_?secret|api_?key|apikey|access_?token|refresh_?token|token|bind_?password|authorization|x-api-key|secret_?id|role_?id)\b["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi, '$1[redacted]'],
  // Long opaque strings (JWTs, API keys, hex/base64 blobs)
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted]'],
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '[redacted]'],
]

/** Redact anything that looks like a credential from a message. */
export function redactSecrets(message: string): string {
  let out = message
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement)
  return out
}

/**
 * Short, single-line, credential-free description of why a sync failed.
 * Strips the "Sync failed for <type>:" prefix the engine adds, keeps the
 * first line only (no stack traces) and truncates to 300 characters.
 */
export function summarizeSyncError(err: unknown): string {
  let message = ''
  if (err instanceof Error) message = err.message
  else if (typeof err === 'string') message = err
  else if (err && typeof err === 'object' && 'message' in err) message = String((err as { message: unknown }).message)
  message = (message || '').split(/\r?\n/)[0].replace(/^Sync failed for [\w-]+:\s*/i, '').trim()
  if (!message) return 'Unknown error'
  message = redactSecrets(message)
  return message.length > MAX_LENGTH ? `${message.slice(0, MAX_LENGTH - 1)}…` : message
}

/** Summary for a sync that completed but reported record-level errors. */
export function summarizeRecordErrors(errors: string[]): string | null {
  if (!errors.length) return null
  const first = summarizeSyncError(errors[0])
  const prefix = errors.length === 1 ? '1 record failed' : `${errors.length} records failed`
  const message = `${prefix}: ${first}`
  return message.length > MAX_LENGTH ? `${message.slice(0, MAX_LENGTH - 1)}…` : message
}
