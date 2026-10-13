'use client'

import { useSession } from 'next-auth/react'
import { hasRole, type AppRole } from '@/lib/utils/rbac'

/**
 * Current user's application role for UI gating.
 *
 * The server is the authority (every mutation route checks the role); this
 * hook only keeps the UI from offering actions that would come back 403.
 * While the session is loading `can()` returns false, so gated controls
 * appear once the role is known rather than flashing and disappearing.
 */
export function useAppRole() {
  const { data: session, status } = useSession()
  const role = (session?.user?.appRole ?? null) as AppRole | null
  return {
    role,
    loading: status === 'loading',
    can: (required: AppRole) => (role ? hasRole(role, required) : false),
  }
}
