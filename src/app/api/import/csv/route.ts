import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { integrationSources } from '@/lib/db/schema'
import { executeSync } from '@/lib/connectors/sync-engine'
import { hasRole } from '@/lib/utils/rbac'
import type { AppRole } from '@/lib/utils/rbac'
import { z } from 'zod'
import { logAction, parseJsonBody } from '@/lib/actions/helpers'

const csvImportSchema = z.object({
  fileContent: z.string().min(1, 'fileContent is required'),
  mapping: z.record(z.string(), z.string()),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Bulk-imports/upserts the core identity dataset — restrict to integration admins.
    if (!hasRole((session.user as any).appRole as AppRole, 'iam_admin')) {
      return NextResponse.json({ error: 'Forbidden: iam_admin role required' }, { status: 403 })
    }

    const parsed = await parseJsonBody(req, csvImportSchema)
    if (!parsed.ok) return parsed.response

    const { fileContent, mapping } = parsed.data
    const orgId = session.user.orgId

    // Create a temporary integration source for this CSV import
    const [integration] = await db
      .insert(integrationSources)
      .values({
        name: `CSV Import ${new Date().toISOString().slice(0, 16)}`,
        type: 'manual' as any,
        config: {},
        syncStatus: 'syncing',
        syncFrequencyMinutes: 0,
        orgId,
      })
      .returning()

    // Execute sync through the sync engine with column mapping
    const report = await executeSync({
      orgId,
      integrationId: integration.id,
      config: {
        type: 'csv',
        credentials: {
          fileContent,
          columnMapping: JSON.stringify(mapping),
        },
      },
      skipReconcile: true, // CSV imports don't need reconciliation
    })

    // Audit counts and the column mapping only — never the raw CSV content.
    await logAction({
      actionType: 'import_data',
      actorIdentityId: session.user.id,
      orgId,
      payload: {
        operation: 'csv_import',
        integrationId: integration.id,
        bytes: fileContent.length,
        mappedColumns: Object.keys(mapping).length,
        identitiesUpserted: report.identitiesUpserted,
        groupsUpserted: report.groupsUpserted,
        entitlementsUpserted: report.entitlementsUpserted,
        errorCount: Array.isArray(report.errors) ? report.errors.length : 0,
      },
    })

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      report: {
        identitiesUpserted: report.identitiesUpserted,
        groupsUpserted: report.groupsUpserted,
        entitlementsUpserted: report.entitlementsUpserted,
        errors: report.errors,
        duration: report.duration,
      },
    })
  } catch (err: any) {
    console.error('[CSV Import] Error:', err)
    return NextResponse.json(
      { error: 'Import failed', details: err.message },
      { status: 500 },
    )
  }
}
