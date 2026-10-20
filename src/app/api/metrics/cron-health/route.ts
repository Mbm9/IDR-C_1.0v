import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api/handler'
import { cronMonitor } from '@/lib/cron/monitor'

// Reads the session per request; never prerender at build time.
export const dynamic = 'force-dynamic'

/**
 * GET /api/metrics/cron-health
 *
 * Returns cron job execution history and health summary.
 * Useful for monitoring dashboards and alerting.
 *
 * Query params:
 *   ?job=risk-scorer  — filter to a specific job
 *   ?limit=20         — number of recent runs to return
 */
export const GET = withApiHandler(async (req: NextRequest, { log }) => {
  const jobName = req.nextUrl.searchParams.get('job') || undefined
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '50'))

  const summary = cronMonitor.getJobSummary()
  const recentRuns = cronMonitor.getRecentRuns(jobName, limit)

  log.info('Cron health queried', { jobFilter: jobName, runsReturned: recentRuns.length })

  return NextResponse.json({
    summary,
    recentRuns,
    totalJobsTracked: Object.keys(summary).length,
  })
}, { requiredRole: 'analyst' })
