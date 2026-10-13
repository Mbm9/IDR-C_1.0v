import { createHash, randomBytes } from 'node:crypto'
import { sendEmail } from '@/lib/email/send'

/**
 * Single-use invitation tokens.
 *
 * Joining an organization requires the token from the invite link, not just
 * knowing the invited email address (which anyone could type at signup).
 * Only the SHA-256 of the token is stored; the link is shown once to the
 * inviting admin and emailed when SMTP is configured.
 */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function inviteUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/signup?invite=${encodeURIComponent(token)}`
}

/** Email the invite link; returns false when SMTP is not configured or sending fails. */
export async function emailInvite(params: { to: string; url: string; orgName?: string | null; role: string }): Promise<boolean> {
  const org = params.orgName || 'Identity Radar'
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  return sendEmail({
    to: params.to,
    subject: `You're invited to ${org} on Identity Radar`,
    html: `<p>You have been invited to join <strong>${esc(org)}</strong> on Identity Radar as <strong>${esc(params.role)}</strong>.</p>
<p><a href="${esc(params.url)}">Accept the invitation</a></p>
<p>The link expires in 7 days and can be used once.</p>`,
    text: `You have been invited to join ${org} on Identity Radar as ${params.role}.\nAccept: ${params.url}\nThe link expires in 7 days and can be used once.`,
  })
}
