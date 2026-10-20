import type { Locale } from '@/lib/locale'
import type { DocsContent } from './content.types'
import { DOCS_CONTENT_EN } from './content.en'
import { DOCS_CONTENT_AR } from './content.ar'

export const DOCS_CONTENT: Record<Locale, DocsContent> = {
  en: DOCS_CONTENT_EN,
  ar: DOCS_CONTENT_AR,
}

/** Returns the documentation content for a locale, falling back to English. */
export function getDocsContent(locale: string): DocsContent {
  return DOCS_CONTENT[locale as Locale] ?? DOCS_CONTENT_EN
}

/**
 * Strips the inline backtick markup so search matches what the reader sees.
 */
export function plainText(text: string): string {
  return text.replace(/`/g, '')
}
