import type { AdTier } from '@/lib/utils/tiers'

/**
 * Names that mark Top Tier (Tier 0 adjacent) systems, groups and roles: things
 * that can take over Tier 0 without being part of it — federation (ADFS),
 * directory sync (Entra/Azure AD Connect), PKI / certificate authorities,
 * PAM and secrets vault admins, and DC backup.
 *
 * Matched case-insensitively at the start of a word, so 'pam admin' does not
 * match "Spam Admins" but 'backup operator' matches "Backup Operators".
 */
export const TOP_TIER_KEYWORDS = [
  // Federation and directory sync
  'adfs', 'aad connect', 'aadconnect', 'azure ad connect', 'entra connect',
  'adsyncadmins', 'adsyncoperators', 'directory sync', 'hybrid identity',
  // PKI / certificate authorities
  'pki', 'certificate authority', 'cert publishers', 'ca admin',
  // PAM and secrets vaults
  'pam vault', 'pam admin', 'vault admin', 'cyberark admin',
  'key vault admin', 'keyvault admin', 'keyvault-admin',
  // Domain controller backup
  'backup operator', 'backup admin', 'dc backup',
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TOP_TIER_RE = new RegExp(`(^|[^a-z0-9])(${TOP_TIER_KEYWORDS.map(escape).join('|')})`, 'i')

/** True when a name (group, role, system, certificate CN...) is a Top Tier signal. */
export function isTopTierName(text: string | null | undefined): boolean {
  return !!text && TOP_TIER_RE.test(text)
}

/**
 * Parse a tier as written in source data or CSV files: 'tier_0', 'Tier 0',
 * 'T0', 'Top Tier', 'TOP', 'tier_top', 'T1'... (case-insensitive).
 * Returns undefined for values it does not recognise.
 */
export function parseTier(value: string | null | undefined): AdTier | undefined {
  if (value == null) return undefined
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, '')
  switch (v) {
    case 'tier0': case 't0': case '0':
      return 'tier_0'
    case 'tiertop': case 'toptier': case 'top': case 'ttop':
      return 'tier_top'
    case 'tier1': case 't1': case '1':
      return 'tier_1'
    case 'tier2': case 't2': case '2':
      return 'tier_2'
    case 'unclassified': case 'none': case '':
      return 'unclassified'
    default:
      return undefined
  }
}
