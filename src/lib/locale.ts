export type Locale = 'en' | 'ar'

export function setLocale(locale: Locale) {
  // Set cookie for server-side reading
  document.cookie = `locale=${locale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`

  // Update dir and lang on html element
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = locale

  // Reload to pick up new messages on the server side
  window.location.reload()
}

export function getLocaleFromCookie(): Locale {
  if (typeof document === 'undefined') return 'en'
  const match = document.cookie.match(/locale=(en|ar)/)
  return (match?.[1] as Locale) || 'en'
}
