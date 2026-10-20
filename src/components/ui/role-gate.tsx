'use client'

import type { ReactNode } from 'react'
import { useAppRole } from '@/lib/hooks/use-app-role'
import type { AppRole } from '@/lib/utils/rbac'

/**
 * Render `children` only when the user has at least `role`.
 *
 *   <RoleGate role="analyst"><button>Run Scan</button></RoleGate>
 *
 * Pass `fallback` to show something else (for example a disabled button with
 * a "Requires Analyst" tooltip) instead of nothing.
 */
export function RoleGate({ role, children, fallback = null }: { role: AppRole; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAppRole()
  return <>{can(role) ? children : fallback}</>
}
