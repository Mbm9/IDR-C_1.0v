import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { evaluateRules } from '@/lib/automation/engine'
import { verifyCronSecret } from '@/lib/auth/cron'

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const allOrgs = await db.select({ id: organizations.id }).from(organizations)
    let totalTriggered = 0
    const allActions: string[] = []

    for (const org of allOrgs) {
      const result = await evaluateRules(org.id)
      totalTriggered += result.triggered
      allActions.push(...result.actions)
    }

    return NextResponse.json({
      success: true,
      message: `Automation engine: ${totalTriggered} rules triggered`,
      triggered: totalTriggered,
      actions: allActions,
    })
  } catch (error) {
    console.error('Automation engine cron error:', error)
    return NextResponse.json(
      { success: false, message: 'Automation engine failed', error: String(error) },
      { status: 500 }
    )
  }
}
