/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * Validates environment variables so a production container refuses to boot
 * with a missing or placeholder NEXTAUTH_SECRET instead of silently signing
 * sessions with a public key. Importing lib/env runs validateEnv(), which
 * throws in production and warns in development.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env')
  }
}
