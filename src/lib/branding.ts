import { count, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import type { Branding } from '@/lib/branding-shared'

export * from '@/lib/branding-shared'

export async function getOrgBranding(orgId: string): Promise<Branding> {
  const [row] = await db
    .select({ name: organizations.brandName, logo: organizations.brandLogo, logoBackground: organizations.brandLogoBackground })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  return { name: row?.name ?? null, logo: row?.logo ?? null, logoBackground: row?.logoBackground ?? false }
}

/**
 * Branding for pages shown before sign-in (login, sign-up). On a single-
 * organization install that is the organization's branding; with several
 * organizations it is the product default, so one tenant's brand is never
 * shown to another tenant's users.
 */
export async function getPublicBranding(): Promise<Branding> {
  const [{ value: orgCount }] = await db.select({ value: count() }).from(organizations)
  if (Number(orgCount) !== 1) return { name: null, logo: null, logoBackground: false }
  const [row] = await db
    .select({ name: organizations.brandName, logo: organizations.brandLogo, logoBackground: organizations.brandLogoBackground })
    .from(organizations)
    .limit(1)
  return { name: row?.name ?? null, logo: row?.logo ?? null, logoBackground: row?.logoBackground ?? false }
}
