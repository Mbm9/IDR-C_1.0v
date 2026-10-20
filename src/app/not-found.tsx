import Link from 'next/link'
import { Shield } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--bg-secondary)]">
      <Shield size={48} className="text-[var(--text-tertiary)] mb-4" />
      <h1 className="text-hero text-[var(--text-tertiary)]">404</h1>
      <p className="text-heading text-[var(--text-secondary)] mt-2 mb-8">Page not found</p>
      <Link
        href="/dashboard"
        className="px-4 py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 transition-opacity"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
