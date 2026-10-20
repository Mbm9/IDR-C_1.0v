// SSRF guard for admin-configured connector endpoints.
//
// Identity Radar is an ON-PREM / air-gapped product, so connectors legitimately
// target internal LAN hosts (Splunk/SAP/PAM on 10.x, 172.16.x, 192.168.x) — those
// ranges are intentionally ALLOWED. We only block destinations that have no
// legitimate connector use and are classic SSRF pivots:
//   • non-HTTP(S) schemes (file:, gopher:, dict:, …)
//   • loopback (127.0.0.0/8, ::1, localhost)  → the app talking to itself
//   • link-local / cloud metadata (169.254.0.0/16, incl. 169.254.169.254; fe80::/10)
//   • unspecified (0.0.0.0, ::)
//
// Residual (accepted): a DNS name that resolves to a blocked IP (DNS rebinding)
// is not caught here — validation is literal-host only. Acceptable because the
// endpoint is set by an authenticated iam_admin and the product is on-prem.

const BLOCKED_HOST_LITERALS = new Set(['localhost', '0.0.0.0', '::', '::1', '[::1]', '[::]'])

function ipv4Parts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return parts
}

/** True for loopback / link-local / unspecified IPv4 (NOT private LAN ranges). */
function isBlockedIpv4(host: string): boolean {
  const p = ipv4Parts(host)
  if (!p) return false
  if (p[0] === 127) return true            // 127.0.0.0/8 loopback
  if (p[0] === 0) return true              // 0.0.0.0/8 unspecified
  if (p[0] === 169 && p[1] === 254) return true // 169.254.0.0/16 link-local + metadata
  return false
}

/**
 * Throw if `raw` is not a safe connector endpoint. Accepts a full URL
 * (https://host:port/path) or a bare host[:port].
 */
export function assertSafeConnectorUrl(raw: string): void {
  const value = String(raw ?? '').trim()
  if (!value) throw new Error('Connector endpoint is empty')

  // Normalise bare host[:port] to a URL so we can parse consistently.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`Invalid connector endpoint: ${value}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Connector endpoint must use http(s), got ${url.protocol}`)
  }

  const host = url.hostname.toLowerCase()
  if (BLOCKED_HOST_LITERALS.has(host) || host.endsWith('.localhost')) {
    throw new Error(`Connector endpoint host is not allowed: ${host}`)
  }
  if (isBlockedIpv4(host)) {
    throw new Error(`Connector endpoint targets a loopback/link-local address: ${host}`)
  }
  // IPv6 loopback / link-local literals (URL keeps brackets in hostname)
  const v6 = host.replace(/^\[|\]$/g, '')
  if (v6 === '::1' || v6 === '::' || v6.startsWith('fe80:') || v6.startsWith('fe80::')) {
    throw new Error(`Connector endpoint targets a loopback/link-local address: ${host}`)
  }
}

// Config keys that hold an endpoint the app will make outbound requests to.
const URL_CONFIG_KEYS = ['baseurl', 'url', 'host', 'endpoint', 'tokenurl', 'server', 'instanceurl', 'domain', 'address', 'vaultaddr']

/** Validate every URL-bearing field in a connector config object. */
export function validateConnectorConfig(config: unknown): void {
  if (!config || typeof config !== 'object') return
  for (const [key, val] of Object.entries(config as Record<string, unknown>)) {
    if (typeof val !== 'string' || !val.trim()) continue
    if (URL_CONFIG_KEYS.includes(key.toLowerCase())) {
      assertSafeConnectorUrl(val)
    }
  }
}
