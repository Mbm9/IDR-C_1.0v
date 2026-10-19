import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { JOBS, isDue, clock } from '../../docker/scheduler.mjs'

type Job = { name: string; every?: number; offset?: number; daily?: string; weekly?: { day: number; at: string } }
const jobs = JOBS as Job[]
const at = (iso: string, tz = 'UTC') => clock(new Date(iso), tz)
const due = (name: string, iso: string, tz?: string) => isDue(jobs.find((j) => j.name === name), at(iso, tz))

describe('docker/scheduler.mjs', () => {
  it('schedules every /api/cron route exactly once', () => {
    const routes = readdirSync(path.join(__dirname, '../../app/api/cron')).sort()
    const names = jobs.map((j) => j.name).sort()
    expect(names).toEqual(routes)
    expect(new Set(names).size).toBe(names.length)
  })

  it('runs interval jobs on their aligned minute', () => {
    expect(due('threat-detector', '2026-10-19T10:05:00Z')).toBe(true)
    expect(due('threat-detector', '2026-10-19T10:06:00Z')).toBe(false)
    expect(due('automation-engine', '2026-10-19T10:07:00Z')).toBe(true)
    expect(due('automation-engine', '2026-10-19T10:15:00Z')).toBe(false)
  })

  it('runs the 6-hourly scans in order: tier, risk, attack paths, exposure', () => {
    expect(due('tier-scanner', '2026-10-19T06:10:00Z')).toBe(true)
    expect(due('risk-scorer', '2026-10-19T06:20:00Z')).toBe(true)
    expect(due('attack-path-scanner', '2026-10-19T06:30:00Z')).toBe(true)
    expect(due('ad-exposure-scanner', '2026-10-19T06:40:00Z')).toBe(true)
    expect(due('tier-scanner', '2026-10-19T07:10:00Z')).toBe(false)
  })

  it('runs daily and weekly jobs once at their time', () => {
    expect(due('daily-briefing', '2026-10-19T04:30:00Z')).toBe(true)
    expect(due('daily-briefing', '2026-10-19T04:31:00Z')).toBe(false)
    expect(due('supply-chain-risk', '2026-10-18T02:30:00Z')).toBe(true) // Sunday
    expect(due('supply-chain-risk', '2026-10-19T02:30:00Z')).toBe(false) // Monday
  })

  it('evaluates daily times in the configured time zone', () => {
    // 04:30 in Riyadh (UTC+3) is 01:30 UTC
    expect(due('daily-briefing', '2026-10-19T01:30:00Z', 'Asia/Riyadh')).toBe(true)
    expect(due('daily-briefing', '2026-10-19T04:30:00Z', 'Asia/Riyadh')).toBe(false)
  })
})
