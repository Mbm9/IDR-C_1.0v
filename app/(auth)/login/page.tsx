'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Languages } from 'lucide-react'
import { BrandMark } from '@/components/ui/brand-mark'
import { usePublicBranding } from '@/lib/hooks/use-organization'
import { useLocale, useTranslations } from 'next-intl'
import { setLocale, type Locale } from '@/lib/locale'

function LoginForm() {
  const { data: session, status } = useSession()
  const t = useTranslations('login')
  const branding = usePublicBranding().data
  const tCommon = useTranslations('common')
  const locale = useLocale() as Locale
  const router = useRouter()
  const searchParams = useSearchParams()
  // Only same-origin relative paths are honoured, to avoid an open redirect.
  const requested = searchParams.get('callbackUrl') || ''
  const callbackUrl = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session) {
      if (!session.user.orgId) {
        router.push('/onboarding')
      } else {
        router.push(callbackUrl)
      }
    }
  }, [session, router, callbackUrl])

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <div className="text-[var(--text-secondary)] animate-pulse" role="status">{tCommon('loading')}</div>
      </main>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error === 'RateLimited' || result?.status === 429) {
        setError(t('rateLimited', { seconds: Number(result.code) || 60 }))
      } else if (result?.error === 'CredentialsSignin') {
        setError(t('invalidCredentials'))
      } else if (result?.error) {
        // CSRF, configuration or database failures: not the user's credentials.
        setError(t('serverError'))
      } else {
        router.push(callbackUrl)
      }
    } catch {
      setError(t('networkError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen bg-[var(--bg-secondary)]">
      <button
        type="button"
        onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        lang={locale === 'ar' ? 'en' : 'ar'}
        className="absolute top-4 end-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] text-caption font-medium text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
        aria-label={t('switchLanguage')}
      >
        <Languages size={14} aria-hidden="true" />
        {locale === 'ar' ? 'English' : 'العربية'}
      </button>
      {/* Left panel -- branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <BrandMark logo={branding?.logo} background={branding?.logoBackground} size={48} />
            <div>
              <p className="text-2xl font-semibold text-white">{branding?.name || t('title')}</p>
              <p className="text-sm text-slate-300">{t('subtitle')}</p>
            </div>
          </div>
          <p className="text-3xl font-semibold text-white leading-tight mb-4">
            {t('taglineLine1')}<br />{t('taglineLine2')}
          </p>
          <p className="text-slate-300 leading-relaxed">
            {t('description')}
          </p>
          <div className="flex gap-3 mt-8">
            {['NCA ECC', 'SAMA CSF', 'PDPL'].map(fw => (
              <span key={fw} dir="ltr" className="px-3 py-1.5 rounded-md bg-white/10 text-xs font-medium text-slate-200">
                {fw}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel -- login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <BrandMark logo={branding?.logo} background={branding?.logoBackground} size={40} />
            <p className="text-xl font-semibold text-[var(--text-primary)]">{branding?.name || t('title')}</p>
          </div>

          <h1 className="text-title text-[var(--text-primary)] mb-1">{t('signInTitle')}</h1>
          <p className="text-caption text-[var(--text-secondary)] mb-6">
            {t('signInSubtitle')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                {t('email')}
              </label>
              <input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-secondary)]"
                placeholder="name@company.sa"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                {t('password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 pe-10 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-secondary)]"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  aria-pressed={showPassword}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="px-3 py-2 rounded-[var(--radius-badge)] text-caption font-medium border text-[var(--text-primary)]" style={{ backgroundColor: 'var(--color-critical-bg)', borderColor: 'var(--color-critical)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? t('signingIn') : t('signIn')}
            </button>
          </form>

          <p className="text-caption text-[var(--text-secondary)] text-center mt-6">
            {t('noAccount')}{' '}
            <Link href="/signup" className="text-[var(--text-primary)] underline font-medium">
              {t('signUp')}
            </Link>
          </p>

          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
            <p className="text-micro text-[var(--text-secondary)] text-center mt-3">
              {t('demoHint')} <bdi dir="ltr">admin@acmefs.sa / admin123</bdi>
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
