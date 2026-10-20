import { createHmac } from 'crypto'

export async function sendWebhook(
  url: string,
  payload: any,
  secret?: string
): Promise<boolean> {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'IdentityRadar/1.0',
  }

  if (secret) {
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    headers['X-IR-Signature'] = signature
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (res.ok) {
        console.log(`[Webhook] Delivered to ${url} (status ${res.status})`)
        return true
      }

      console.warn(`[Webhook] Non-OK response from ${url}: ${res.status}`)
      if (attempt === 0) continue
      return false
    } catch (err: any) {
      console.error(`[Webhook] Attempt ${attempt + 1} failed for ${url}:`, err.message)
      if (attempt === 0) continue
      return false
    }
  }

  return false
}
