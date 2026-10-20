/**
 * Cron Job Execution Monitor
 *
 * Tracks cron job execution history (start time, duration, status, records processed).
 * Stores results in a lightweight in-memory ring buffer with periodic DB persistence.
 *
 * Usage in cron routes:
 *   import { cronMonitor } from '@/lib/cron/monitor'
 *
 *   export async function POST(req) {
 *     return cronMonitor.run('risk-scorer', async (tracker) => {
 *       // ... your cron logic
 *       tracker.setRecordsProcessed(142)
 *       return NextResponse.json({ success: true })
 *     })
 *   }
 */

import { logger } from '@/lib/logger'

export interface CronRun {
  jobName: string
  startedAt: string
  completedAt: string
  durationMs: number
  status: 'success' | 'error'
  recordsProcessed?: number
  error?: string
}

interface Tracker {
  setRecordsProcessed: (count: number) => void
}

class CronMonitor {
  // Ring buffer of recent runs (max 200 entries in memory)
  private runs: CronRun[] = []
  private readonly maxRuns = 200

  /**
   * Execute a cron job with automatic monitoring.
   * Tracks timing, catches errors, and logs structured output.
   */
  async run<T>(
    jobName: string,
    fn: (tracker: Tracker) => Promise<T>,
  ): Promise<T> {
    const log = logger.child({ cron: jobName })
    const startedAt = new Date()
    let recordsProcessed: number | undefined

    const tracker: Tracker = {
      setRecordsProcessed: (count: number) => { recordsProcessed = count },
    }

    log.info('Cron job started')

    try {
      const result = await fn(tracker)

      const completedAt = new Date()
      const durationMs = completedAt.getTime() - startedAt.getTime()

      const run: CronRun = {
        jobName,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        status: 'success',
        recordsProcessed,
      }

      this.addRun(run)
      log.info('Cron job completed', { durationMs, recordsProcessed })

      return result
    } catch (error: any) {
      const completedAt = new Date()
      const durationMs = completedAt.getTime() - startedAt.getTime()

      const run: CronRun = {
        jobName,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        status: 'error',
        recordsProcessed,
        error: error.message,
      }

      this.addRun(run)
      log.error('Cron job failed', { durationMs, error: error.message })

      throw error
    }
  }

  private addRun(run: CronRun) {
    this.runs.push(run)
    if (this.runs.length > this.maxRuns) {
      this.runs = this.runs.slice(-this.maxRuns)
    }
  }

  /**
   * Get recent runs, optionally filtered by job name.
   */
  getRecentRuns(jobName?: string, limit = 50): CronRun[] {
    let filtered = jobName
      ? this.runs.filter(r => r.jobName === jobName)
      : this.runs
    return filtered.slice(-limit).reverse()
  }

  /**
   * Get summary of all jobs' last execution status.
   */
  getJobSummary(): Record<string, {
    lastRun: string
    lastStatus: 'success' | 'error'
    lastDurationMs: number
    totalRuns: number
    errorCount: number
  }> {
    const summary: Record<string, any> = {}

    for (const run of this.runs) {
      if (!summary[run.jobName]) {
        summary[run.jobName] = {
          lastRun: run.completedAt,
          lastStatus: run.status,
          lastDurationMs: run.durationMs,
          totalRuns: 0,
          errorCount: 0,
        }
      }

      const s = summary[run.jobName]
      s.totalRuns++
      if (run.status === 'error') s.errorCount++
      // Keep the most recent run's info
      if (run.completedAt > s.lastRun) {
        s.lastRun = run.completedAt
        s.lastStatus = run.status
        s.lastDurationMs = run.durationMs
      }
    }

    return summary
  }
}

// Singleton instance
export const cronMonitor = new CronMonitor()
