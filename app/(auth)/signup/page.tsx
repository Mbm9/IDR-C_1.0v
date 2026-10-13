'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Shield, Eye, EyeOff, Users } from 'lucide-react'

interface JoinedOrganization {
  id: string
  name: string | null
  role: string
}

const ROLE_KEYS = ['viewer', 'analyst', 'iam_admin', 'ciso', 'admin'] as const
type RoleKey = (typeof ROLE_KEYS)[number]

function SignupForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  // Token from the invite link; required to join the inviting organization.
  const inviteToken = useSearchParams().get('invite') || undefined
  const t = useTranslations('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Set when the email had a pending invitation and the account joined that org.
  const [joined, setJoined] = useState<JoinedOrganization | null>(null)

  useEffect(() => {
    // After joining an organization the confirmation below handles the redirect.
    if (joined) return
    if (session) {
      if (!session.user.orgId) {
        router.push('/onboarding')
      } else {
        router.push('/dashboard')
      }
    }
  }, [session, router, joined])

  useEffect(() => {
    if (!joined || loading) return
    const timer = setTimeout(() => router.push('/dashboard'), 2500)
    return () => clearTimeout(timer)
  }, [joined, loading, router])

  const roleLabel = (role: string) =>
    (ROLE_KEYS as readonly string[]).includes(role) ? t(`roles.${role as RoleKey}`) : role

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <div className="text-[var(--text-tertiary)] animate-pulse">{t('loading')}</div>
      </main>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteToken }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || t('errorCreate'))
        setLoading(false)
        return
      }
      const joinedOrg: JoinedOrganization | null = data.joinedOrganization ?? null
      if (joinedOrg) setJoined(joinedOrg)

      // Auto sign in after signup
      const result = await signIn('credentials', { email, password, redirect: false })
      setLoading(false)

      if (result?.error) {
        setJoined(null)
        setError(t('errorSignIn'))
      } else if (!joinedOrg) {
        // New organization: set it up in onboarding. Invited users already
        // belong to an organization and go straight to the dashboard.
        router.push('/onboarding')
      }
    } catch {
      setError(t('errorGeneric'))
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen bg-[var(--bg-secondary)]">
      {/* Left panel -- branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-info)] flex items-center justify-center">
              <Shield size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">{t('brand')}</h1>
              <p className="text-sm text-slate-400">{t('brandSubtitle')}</p>
            </div>
          </div>
          <h2 className="text-3xl font-semibold text-white leading-tight mb-4">
            {t('heroTitle')}
          </h2>
          <p className="text-slate-400 leading-relaxed">
            {t('heroDescription')}
          </p>
          <div className="mt-8 space-y-3">
            {[
              t('featureUnified'),
              t('featureTiering'),
              t('featureAi'),
              t('featureCompliance'),
            ].map(item => (
              <div key={item} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[var(--color-low)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-sm text-slate-400">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel -- signup form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-info)] flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t('brand')}</h1>
          </div>

          {joined ? (
            <div
              role="status"
              data-testid="signup-joined-org"
              className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-6 text-center"
            >
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-[var(--color-info)]/10 flex items-center justify-center">
                <Users size={22} className="text-[var(--color-info)]" />
              </div>
              <h2 className="text-title text-[var(--text-primary)] mb-2">{t('joinedTitle')}</h2>
              <p className="text-body text-[var(--text-secondary)] mb-6">
                {joined.name
                  ? t('joinedBody', { org: joined.name, role: roleLabel(joined.role) })
                  : t('joinedBodyNoName', { role: roleLabel(joined.role) })}
              </p>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                disabled={loading}
                className="w-full py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? t('signingIn') : t('continueToDashboard')}
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-title text-[var(--text-primary)] mb-1">{t('title')}</h2>
              <p className="text-caption text-[var(--text-secondary)] mb-1">
                {t('subtitle')}
              </p>
              <p className="text-micro text-[var(--text-tertiary)] mb-6">
                {inviteToken ? t('invitedFromLink') : t('invitedHint')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                    {t('fullName')}
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                    placeholder={t('fullNamePlaceholder')}
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                    {t('workEmail')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    dir="ltr"
                    className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                    placeholder={t('workEmailPlaceholder')}
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
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full px-3 py-2.5 pe-10 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                      placeholder={t('passwordPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div role="alert" className="px-3 py-2 rounded-[var(--radius-badge)] text-caption font-medium" style={{ backgroundColor: 'var(--color-critical-bg)', color: 'var(--color-critical)' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {loading ? t('creating') : t('create')}
                </button>
              </form>

              <p className="text-caption text-[var(--text-secondary)] text-center mt-6">
                {t('haveAccount')}{' '}
                <Link href="/login" className="text-[var(--color-info)] hover:underline font-medium">
                  {t('signIn')}
                </Link>
              </p>

              <p className="text-micro text-[var(--text-tertiary)] text-center mt-4">
                {t('terms')}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
