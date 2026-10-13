import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatRelativeTime,
  formatDate,
  formatDateTime,
  formatNumber,
  formatCompactNumber,
  formatPercentage,
} from '@/lib/utils/formatters'

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a date from a few seconds ago', () => {
    const result = formatRelativeTime(new Date('2026-03-26T11:59:50Z'))
    expect(result).toMatch(/10 seconds ago|just now/)
  })

  it('formats a date from a few minutes ago', () => {
    const result = formatRelativeTime(new Date('2026-03-26T11:55:00Z'))
    expect(result).toMatch(/5 minutes ago/)
  })

  it('formats a date from 2 hours ago', () => {
    const result = formatRelativeTime(new Date('2026-03-26T10:00:00Z'))
    expect(result).toMatch(/2 hours ago/)
  })

  it('formats a date from 3 days ago', () => {
    const result = formatRelativeTime(new Date('2026-03-23T12:00:00Z'))
    expect(result).toMatch(/3 days ago/)
  })

  it('formats a date from 2 weeks ago', () => {
    const result = formatRelativeTime(new Date('2026-03-12T12:00:00Z'))
    expect(result).toMatch(/2 weeks ago/)
  })

  it('formats a date from 3 months ago', () => {
    const result = formatRelativeTime(new Date('2025-12-26T12:00:00Z'))
    expect(result).toMatch(/3 months ago/)
  })

  it('formats a date from 1 year ago', () => {
    const result = formatRelativeTime(new Date('2025-03-26T12:00:00Z'))
    expect(result).toMatch(/1 year ago|last year|12 months ago/)
  })

  it('accepts a date string', () => {
    const result = formatRelativeTime('2026-03-26T11:00:00Z')
    expect(result).toMatch(/1 hour ago/)
  })

  it('formats a future date', () => {
    const result = formatRelativeTime(new Date('2026-03-27T12:00:00Z'))
    expect(result).toMatch(/in 1 day|tomorrow/)
  })
})

describe('formatDate', () => {
  it('formats a Date object', () => {
    const result = formatDate(new Date('2026-01-15T00:00:00Z'))
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2026/)
  })

  it('formats a date string', () => {
    const result = formatDate('2025-12-25T00:00:00Z')
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/25/)
    expect(result).toMatch(/2025/)
  })

  it('handles different months', () => {
    const result = formatDate('2026-06-01T00:00:00Z')
    expect(result).toMatch(/Jun/)
  })
})

describe('formatDateTime', () => {
  it('formats a Date object with time', () => {
    const result = formatDateTime(new Date('2026-01-15T14:30:00Z'))
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2026/)
    // Should contain some time representation
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('formats a date string with time', () => {
    const result = formatDateTime('2025-12-25T09:15:00Z')
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/25/)
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('includes both date and time components', () => {
    const result = formatDateTime('2026-03-26T00:00:00Z')
    // Should not be empty
    expect(result.length).toBeGreaterThan(5)
  })
})

describe('formatNumber', () => {
  it('formats thousands with comma separator', () => {
    expect(formatNumber(1000)).toBe('1,000')
  })

  it('formats millions', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('formats small numbers without separator', () => {
    expect(formatNumber(42)).toBe('42')
  })

  it('formats negative numbers', () => {
    const result = formatNumber(-1500)
    expect(result).toMatch(/-1,500/)
  })
})

describe('formatCompactNumber', () => {
  it('formats thousands as K', () => {
    const result = formatCompactNumber(1500)
    expect(result).toMatch(/1\.5K|1,500/)
  })

  it('formats millions as M', () => {
    const result = formatCompactNumber(2500000)
    expect(result).toMatch(/2\.5M/)
  })

  it('formats small numbers as-is', () => {
    expect(formatCompactNumber(42)).toBe('42')
  })

  it('formats zero', () => {
    expect(formatCompactNumber(0)).toBe('0')
  })
})

describe('formatPercentage', () => {
  it('formats integer percentage', () => {
    expect(formatPercentage(75)).toBe('75%')
  })

  it('formats percentage with decimals', () => {
    expect(formatPercentage(75.5, 1)).toBe('75.5%')
  })

  it('formats zero percent', () => {
    expect(formatPercentage(0)).toBe('0%')
  })

  it('formats 100 percent', () => {
    expect(formatPercentage(100)).toBe('100%')
  })

  it('rounds when no decimals specified', () => {
    expect(formatPercentage(75.678)).toBe('76%')
  })

  it('formats with 2 decimal places', () => {
    expect(formatPercentage(33.333, 2)).toBe('33.33%')
  })
})

describe('Arabic locale', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('renders relative times fully in Arabic (no English fragments to reorder in RTL)', () => {
    const out = formatRelativeTime(new Date('2026-03-20T12:00:00Z'), 'ar')
    expect(out).toMatch(/[؀-ۿ]/)
    expect(out).not.toMatch(/ago|days?/i)
  })

  it('keeps Latin digits and the Gregorian calendar for Arabic dates', () => {
    const out = formatDate(new Date('2026-03-20T12:00:00Z'), 'ar')
    expect(out).toMatch(/2026/)
    expect(out).not.toMatch(/[٠-٩]/) // no Arabic-Indic digits
  })

  it('keeps the English output unchanged when no locale is given in a non-browser context', () => {
    expect(formatRelativeTime(new Date('2026-03-20T12:00:00Z'))).toMatch(/ago|days/i)
  })
})
