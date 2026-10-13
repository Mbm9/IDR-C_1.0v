'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { Shield, Eye, EyeOff } from 'lucide-react'

function LoginForm() {
  const { data: session, status } = useSession()
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
        <div className="text-[var(--text-tertiary)] animate-pulse">Loading...</div>
      </main>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)

    if (result?.error) {
      setError('Invalid email or password')
    } else {
      router.push(callbackUrl)
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
              <h1 className="text-2xl font-semibold text-white">Identity Radar</h1>
              <p className="text-sm text-slate-400">IAM Posture Management</p>
            </div>
          </div>
          <h2 className="text-3xl font-semibold text-white leading-tight mb-4">
            See every identity.<br />Fix every risk.
          </h2>
          <p className="text-slate-400 leading-relaxed">
            AI-powered identity and access management posture platform with Active Directory
            tiering, non-human identity tracking, and automated compliance.
          </p>
          <div className="flex gap-3 mt-8">
            {['NCA ECC', 'SAMA CSF', 'PDPL'].map(fw => (
              <span key={fw} className="px-3 py-1.5 rounded-md bg-white/10 text-xs font-medium text-slate-300">
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
            <div className="w-10 h-10 rounded-lg bg-[var(--color-info)] flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Identity Radar</h1>
          </div>

          <h2 className="text-title text-[var(--text-primary)] mb-1">Sign in</h2>
          <p className="text-caption text-[var(--text-secondary)] mb-6">
            Enter your credentials to access the dashboard
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                placeholder="admin@acmefs.sa"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 pr-10 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-[var(--radius-badge)] text-caption font-medium" style={{ backgroundColor: 'var(--color-critical-bg)', color: 'var(--color-critical)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-caption text-[var(--text-secondary)] text-center mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[var(--color-info)] hover:underline font-medium">
              Sign up
            </Link>
          </p>

          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
            <p className="text-micro text-[var(--text-tertiary)] text-center mt-3">
              Demo: admin@acmefs.sa / admin123
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
