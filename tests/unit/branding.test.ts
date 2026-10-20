import { describe, it, expect } from 'vitest'
import {
  brandingUpdateSchema, logoSchema, brandName, isPdfLogo, base64Bytes, MAX_LOGO_BYTES, DEFAULT_BRAND_NAME,
} from '@/lib/branding-shared'

const png = (bytes: number) => `data:image/png;base64,${Buffer.alloc(bytes, 1).toString('base64')}`

describe('branding validation', () => {
  it('accepts PNG, JPEG, WebP and SVG logos up to 256 KB', () => {
    expect(logoSchema.safeParse(png(1024)).success).toBe(true)
    expect(logoSchema.safeParse(png(MAX_LOGO_BYTES)).success).toBe(true)
    for (const type of ['jpeg', 'webp', 'svg+xml']) {
      expect(logoSchema.safeParse(`data:image/${type};base64,AAAA`).success).toBe(true)
    }
  })

  it('rejects oversized, non-image and non-data-URL logos', () => {
    expect(logoSchema.safeParse(png(MAX_LOGO_BYTES + 1)).success).toBe(false)
    expect(logoSchema.safeParse('data:text/html;base64,PHNjcmlwdD4=').success).toBe(false)
    expect(logoSchema.safeParse('javascript:alert(1)').success).toBe(false)
    expect(logoSchema.safeParse('https://example.com/logo.png').success).toBe(false)
    expect(logoSchema.safeParse('data:image/png;base64,<svg onload=x>').success).toBe(false)
  })

  it('trims names, allows null to reset, and requires at least one field', () => {
    expect(brandingUpdateSchema.parse({ name: '  Acme  ' }).name).toBe('Acme')
    expect(brandingUpdateSchema.safeParse({ name: null, logo: null }).success).toBe(true)
    expect(brandingUpdateSchema.safeParse({}).success).toBe(false)
    expect(brandingUpdateSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false)
    expect(brandingUpdateSchema.safeParse({ name: 'Acme', extra: 1 }).success).toBe(false)
  })

  it('accepts the logo background toggle on its own, as a boolean only', () => {
    expect(brandingUpdateSchema.parse({ logoBackground: true }).logoBackground).toBe(true)
    expect(brandingUpdateSchema.parse({ logoBackground: false }).logoBackground).toBe(false)
    expect(brandingUpdateSchema.safeParse({ logoBackground: 'yes' }).success).toBe(false)
    expect(brandingUpdateSchema.safeParse({ logoBackground: null }).success).toBe(false)
  })

  it('computes decoded size without decoding', () => {
    for (const n of [1, 2, 3, 100, 1001]) {
      expect(base64Bytes(Buffer.alloc(n).toString('base64'))).toBe(n)
    }
  })

  it('falls back to the product name and embeds only PNG/JPEG in PDFs', () => {
    expect(brandName({ name: null })).toBe(DEFAULT_BRAND_NAME)
    expect(brandName({ name: 'Acme' })).toBe('Acme')
    expect(isPdfLogo(png(10))).toBe(true)
    expect(isPdfLogo('data:image/svg+xml;base64,AAAA')).toBe(false)
    expect(isPdfLogo(null)).toBe(false)
  })
})
