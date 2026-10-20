/**
 * Structured Logger for Identity Radar
 *
 * Outputs JSON-formatted logs in production (parseable by log aggregators)
 * and human-readable logs in development. No external dependencies.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('Identity sync completed', { source: 'azure_ad', count: 42 })
 *   logger.error('Sync failed', { source: 'ldap', error: err.message })
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  msg: string
  timestamp: string
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MIN_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'] ?? 1
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function formatLog(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < MIN_LEVEL) return

  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data,
  }

  if (IS_PRODUCTION) {
    // JSON output for log aggregators
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    console[method](JSON.stringify(entry))
  } else {
    // Human-readable in development
    const prefix = {
      debug: '🔍',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
    }[level]
    const extra = data ? ` ${JSON.stringify(data)}` : ''
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    console[method](`${prefix} [${level.toUpperCase()}] ${msg}${extra}`)
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => formatLog('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => formatLog('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => formatLog('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => formatLog('error', msg, data),

  /**
   * Create a child logger with preset context fields.
   * Useful for request-scoped logging.
   */
  child: (context: Record<string, unknown>) => ({
    debug: (msg: string, data?: Record<string, unknown>) => formatLog('debug', msg, { ...context, ...data }),
    info: (msg: string, data?: Record<string, unknown>) => formatLog('info', msg, { ...context, ...data }),
    warn: (msg: string, data?: Record<string, unknown>) => formatLog('warn', msg, { ...context, ...data }),
    error: (msg: string, data?: Record<string, unknown>) => formatLog('error', msg, { ...context, ...data }),
  }),
}
