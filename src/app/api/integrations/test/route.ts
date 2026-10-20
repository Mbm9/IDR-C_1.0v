import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { createConnector } from '@/lib/connectors/factory'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { validateConnectorConfig } from '@/lib/connectors/url-guard'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Testing triggers an outbound request to the supplied endpoint — restrict to
  // the same role that manages integrations, so lower-privilege users cannot use
  // it as an SSRF probe.
  if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
    return NextResponse.json({ ok: false, message: 'Forbidden: iam_admin role required' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { type, credentials } = body

    if (!type || !credentials) {
      return NextResponse.json(
        { ok: false, message: 'Missing type or credentials' },
        { status: 400 }
      )
    }

    // SSRF guard: reject loopback / link-local / metadata endpoints
    try {
      validateConnectorConfig(credentials)
    } catch (e: any) {
      return NextResponse.json({ ok: false, message: e.message || 'Invalid connector endpoint' }, { status: 400 })
    }

    const connector = createConnector({ type, credentials })
    const result = await connector.testConnection()

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err.message || 'Connection test failed' },
      { status: 500 }
    )
  }
}
