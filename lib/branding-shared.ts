import { z } from 'zod'

// Client-safe branding helpers (no database access). Server loaders: lib/branding.ts.

/** Product name shown when an organization has not set its own. */
export const DEFAULT_BRAND_NAME = 'Identity Radar'

/** Largest logo accepted, before base64 encoding. */
export const MAX_LOGO_BYTES = 256 * 1024

const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/

/** Decoded size of a base64 payload, without decoding it. */
export function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

/**
 * Logo as a data: URL. Rendered only through <img> (where SVG scripts never
 * run) and in PDFs (PNG/JPEG only), so no markup is ever injected into a page.
 */
export const logoSchema = z.string().max(400_000).refine((value) => {
  const m = LOGO_DATA_URL.exec(value)
  return !!m && base64Bytes(m[2]) <= MAX_LOGO_BYTES
}, { message: 'Logo must be a PNG, JPEG, WebP or SVG image of at most 256 KB' })

/** PUT body: send a field to change it, null to reset it to the default. */
export const brandingUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).nullable().optional(),
  logo: logoSchema.nullable().optional(),
  logoBackground: z.boolean().optional(),
}).strict().refine((b) => b.name !== undefined || b.logo !== undefined || b.logoBackground !== undefined, {
  message: 'Nothing to update',
})

export type BrandingUpdate = z.infer<typeof brandingUpdateSchema>

export interface Branding {
  /** Display name; null = the product name. */
  name: string | null
  /** Logo data URL; null = the built-in shield. */
  logo: string | null
  /** Draw the logo on a white tile; false = transparent. */
  logoBackground: boolean
}

/** The name to display for a branding record. */
export const brandName = (b: Pick<Branding, 'name'> | null | undefined) => b?.name || DEFAULT_BRAND_NAME

/** True when react-pdf can embed the logo (it does not render SVG or WebP). */
export const isPdfLogo = (logo: string | null | undefined): logo is string =>
  !!logo && /^data:image\/(png|jpeg);base64,/.test(logo)
