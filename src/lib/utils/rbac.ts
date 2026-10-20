export type AppRole = 'viewer' | 'analyst' | 'iam_admin' | 'ciso' | 'admin'

export const ROLE_HIERARCHY: Record<AppRole, number> = {
  viewer: 0,
  analyst: 1,
  iam_admin: 2,
  ciso: 3,
  admin: 4,
}

export function hasRole(userRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function hasAnyRole(userRole: AppRole, requiredRoles: AppRole[]): boolean {
  return requiredRoles.some((role) => hasRole(userRole, role))
}

export function hasPermission(userRole: AppRole, requiredRoles: AppRole[]): boolean {
  return requiredRoles.some((role) => hasRole(userRole, role))
}

export const ROLE_LABELS: Record<AppRole, string> = {
  viewer: 'Viewer',
  analyst: 'Analyst',
  iam_admin: 'IAM Admin',
  ciso: 'CISO',
  admin: 'Admin',
}
