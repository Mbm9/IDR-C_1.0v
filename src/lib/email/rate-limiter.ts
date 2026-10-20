/**
 * Email Rate Limiter
 *
 * Prevents email floods by limiting one email per type per user
 * within a cooldown window. Uses an in-memory Map.
 */

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

const cooldowns = new Map<string, number>()

/**
 * Check if an email can be sent, and if so, record it.
 * Returns true if the email should be sent, false if rate-limited.
 */
export function checkEmailRateLimit(
  userId: string,
  notificationType: string,
  cooldownMs = DEFAULT_COOLDOWN_MS,
): boolean {
  const key = `${userId}:${notificationType}`
  const lastSent = cooldowns.get(key)
  const now = Date.now()

  if (lastSent && now - lastSent < cooldownMs) {
    return false // Rate-limited
  }

  cooldowns.set(key, now)

  // Periodic cleanup: remove entries older than 1 hour
  if (cooldowns.size > 1000) {
    const cutoff = now - 60 * 60 * 1000
    for (const [k, v] of cooldowns) {
      if (v < cutoff) cooldowns.delete(k)
    }
  }

  return true
}
