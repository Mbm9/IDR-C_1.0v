// Locale-aware formatting helpers.
//
// Every function takes an optional `locale` ('en' | 'ar' or any BCP 47 tag).
// Client components should pass the active locale from next-intl's
// `useLocale()`. When it is omitted, the browser's <html lang> (set from the
// `locale` cookie by the root layout) is used, then the cookie itself, and
// 'en' on the server. Arabic output keeps Latin digits and the Gregorian
// calendar so numbers read the same as everywhere else in the UI.

type DateInput = Date | string | number

const DIVISIONS: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, name: 'seconds' },
  { amount: 60, name: 'minutes' },
  { amount: 24, name: 'hours' },
  { amount: 7, name: 'days' },
  { amount: 4.34524, name: 'weeks' },
  { amount: 12, name: 'months' },
  { amount: Number.POSITIVE_INFINITY, name: 'years' },
]

/** The active UI locale ('en' | 'ar'), resolved without React context. */
export function resolveLocale(locale?: string): string {
  if (locale) return locale
  if (typeof document !== 'undefined') {
    const lang = document.documentElement?.lang
    if (lang) return lang
    const match = document.cookie?.match(/(?:^|;\s*)locale=(en|ar)\b/)
    if (match) return match[1]
  }
  return 'en'
}

/** Map a UI locale to the Intl tag used for formatting. */
function intlTag(locale?: string): string {
  const l = resolveLocale(locale)
  if (l === 'ar' || l.startsWith('ar-')) return 'ar-u-nu-latn-ca-gregory'
  if (l === 'en') return 'en-US'
  return l
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>()
function relativeFormatter(tag: string): Intl.RelativeTimeFormat {
  let rtf = rtfCache.get(tag)
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
    rtfCache.set(tag, rtf)
  }
  return rtf
}

function toDate(date: DateInput): Date {
  return date instanceof Date ? date : new Date(date)
}

export function formatRelativeTime(date: DateInput, locale?: string): string {
  const d = toDate(date)
  const tag = intlTag(locale)
  let duration = (d.getTime() - Date.now()) / 1000

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeFormatter(tag).format(Math.round(duration), division.name)
    }
    duration /= division.amount
  }
  return d.toLocaleDateString(tag)
}

export function formatDate(date: DateInput, locale?: string): string {
  return toDate(date).toLocaleDateString(intlTag(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(date: DateInput, locale?: string): string {
  return toDate(date).toLocaleDateString(intlTag(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatNumber(num: number, locale?: string): string {
  return new Intl.NumberFormat(locale ? intlTag(locale) : 'en-US').format(num)
}

export function formatCompactNumber(num: number, locale?: string): string {
  return new Intl.NumberFormat(locale ? intlTag(locale) : 'en', { notation: 'compact' }).format(num)
}

export function formatPercentage(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`
}
