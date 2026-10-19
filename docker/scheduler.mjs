// Identity Radar scheduler: calls the /api/cron/* jobs on their cadence.
//
// Runs in its own container from the app image (Node only, no dependencies).
// Each job is an authenticated GET with `Authorization: Bearer $CRON_SECRET`.
// Times are evaluated in SCHEDULE_TZ (default UTC); jobs never overlap
// themselves, and a missed minute is not replayed.
//
// Env:
//   CRON_SECRET          required; must match the app's CRON_SECRET
//   APP_URL              default http://app:3000
//   SCHEDULE_TZ          IANA time zone for daily/weekly jobs, e.g. Asia/Riyadh
//   RUN_ON_START=false   skip the initial run of the 6-hourly scans

/**
 * Cadence per job. `every` = minutes (aligned to midnight, plus `offset`);
 * `daily` = "HH:MM"; `weekly` = { day: 0-6 (Sun=0), at: "HH:MM" }.
 * Nightly jobs are staggered so they do not compete for the database, and the
 * daily briefing runs after them so it summarises fresh results.
 */
export const JOBS = [
  { name: 'threat-detector', every: 5 },
  { name: 'sync-health', every: 15 },
  { name: 'automation-engine', every: 15, offset: 7 },
  { name: 'tier-scanner', every: 360, offset: 10, onStart: true },
  { name: 'risk-scorer', every: 360, offset: 20, onStart: true },
  { name: 'attack-path-scanner', every: 360, offset: 30, onStart: true },
  { name: 'ad-exposure-scanner', every: 360, offset: 40, onStart: true },
  { name: 'dormancy-detector', daily: '01:05' },
  { name: 'nhi-orphan', daily: '01:15' },
  { name: 'cert-expiry', daily: '01:25' },
  { name: 'shadow-admin-scanner', daily: '01:35' },
  { name: 'peer-anomaly-detector', daily: '01:45' },
  { name: 'data-steward', daily: '01:55' },
  { name: 'event-cleanup', daily: '03:10' },
  { name: 'daily-briefing', daily: '04:30' },
  { name: 'supply-chain-risk', weekly: { day: 0, at: '02:30' } },
]

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Wall-clock parts of `date` in `timeZone`. */
export function clock(date, timeZone = 'UTC') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )
  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)
  return { weekday: WEEKDAYS[parts.weekday], hour, minute, minuteOfDay: hour * 60 + minute }
}

const hhmm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }

/** True when `job` is due at the wall-clock minute `c`. */
export function isDue(job, c) {
  if (job.every) return c.minuteOfDay % job.every === (job.offset ?? 0) % job.every
  if (job.daily) return c.minuteOfDay === hhmm(job.daily)
  if (job.weekly) return c.weekday === job.weekly.day && c.minuteOfDay === hhmm(job.weekly.at)
  return false
}

// ── Runner ──────────────────────────────────────────────────────────────────

function log(fields) {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...fields }))
}

async function runJob(job, base, secret) {
  const started = Date.now()
  try {
    const res = await fetch(`${base}/api/cron/${job.name}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15 * 60 * 1000),
    })
    const text = await res.text()
    let message = text.slice(0, 200)
    try { const body = JSON.parse(text); message = body.message ?? body.error ?? message } catch {}
    log({ job: job.name, ok: res.ok, status: res.status, ms: Date.now() - started, message })
    if (res.status === 401) log({ job: job.name, hint: 'CRON_SECRET in the scheduler does not match the app' })
  } catch (err) {
    log({ job: job.name, ok: false, ms: Date.now() - started, error: String(err?.message ?? err) })
  }
}

async function main() {
  const base = (process.env.APP_URL || 'http://app:3000').replace(/\/$/, '')
  const secret = process.env.CRON_SECRET
  const tz = process.env.SCHEDULE_TZ || 'UTC'
  if (!secret) {
    // Stay up (so the container does not restart-loop) but do nothing useful.
    log({ ok: false, error: 'CRON_SECRET is not set; no jobs will run. Add it to .env and recreate the scheduler.' })
    setInterval(() => log({ ok: false, error: 'CRON_SECRET is not set' }), 60 * 60 * 1000)
    return
  }
  let zone = tz
  try { clock(new Date(), tz) } catch {
    log({ ok: false, error: `Unknown SCHEDULE_TZ "${tz}"; using UTC` })
    zone = 'UTC'
  }
  log({ ok: true, message: `Scheduler started: ${JOBS.length} jobs, time zone ${zone}, app ${base}` })

  const running = new Set()
  const fire = (job) => {
    if (running.has(job.name)) { log({ job: job.name, skipped: 'previous run still in progress' }); return }
    running.add(job.name)
    runJob(job, base, secret).finally(() => running.delete(job.name))
  }

  if (process.env.RUN_ON_START !== 'false') {
    // Fill the dashboards on first start instead of waiting up to six hours.
    // Sequential: each scan builds on the previous one (tier -> risk -> paths).
    ;(async () => {
      for (const job of JOBS.filter((j) => j.onStart)) {
        running.add(job.name)
        await runJob(job, base, secret)
        running.delete(job.name)
      }
    })()
  }

  let lastMinute = ''
  const tick = () => {
    const now = new Date()
    const key = now.toISOString().slice(0, 16)
    if (key === lastMinute) return
    lastMinute = key
    const c = clock(now, zone)
    for (const job of JOBS) if (isDue(job, c)) fire(job)
  }
  setInterval(tick, 15 * 1000)
  tick()
}

if (process.argv[1] && process.argv[1].endsWith('scheduler.mjs')) main()
