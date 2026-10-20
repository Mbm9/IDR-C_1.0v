'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function RootPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (session) {
      router.replace('/dashboard')
    } else {
      router.replace('/login')
    }
  }, [session, status, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
      <div className="text-[var(--text-tertiary)] animate-pulse">Loading...</div>
    </main>
  )
}
