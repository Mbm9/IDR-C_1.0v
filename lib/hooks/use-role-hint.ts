'use client'

import { useTranslations } from 'next-intl'
import { useAppRole } from '@/lib/hooks/use-app-role'
import type { AppRole } from '@/lib/utils/rbac'

/**
 * `useAppRole()` plus a localized "Requires the X role" hint for controls the
 * current user cannot use. Pages either hide such controls or render them
 * disabled with `title={hint('iam_admin')}`.
 *
 *   const { can, hint } = useRoleHint()
 *   <button disabled={!can('iam_admin')} title={can('iam_admin') ? undefined : hint('iam_admin')}>…</button>
 */
export function useRoleHint() {
  const appRole = useAppRole()
  const t = useTranslations('access')
  return {
    ...appRole,
    roleName: (role: AppRole) => t(`roles.${role}`),
    hint: (role: AppRole) => t('requiresRole', { role: t(`roles.${role}`) }),
    /** Props for a control that needs `role`: disabled + tooltip when the user lacks it. */
    gate: (role: AppRole) => appRole.can(role)
      ? {}
      : { disabled: true, title: t('requiresRole', { role: t(`roles.${role}`) }), 'aria-disabled': true as const },
  }
}
