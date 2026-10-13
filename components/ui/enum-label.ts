import { useTranslations } from 'next-intl'

// Display names for database enum values (source systems, sub-types, statuses…).
// Labels live in messages under `enumLabels.<group>.<value>`; unknown values fall
// back to a humanized form of the raw key so new enum members never render blank.

export type EnumGroup =
  | 'sourceSystem'
  | 'platform'
  | 'identityType'
  | 'subType'
  | 'violationType'
  | 'findingStatus'
  | 'accountType'
  | 'groupType'
  | 'membershipType'
  | 'permissionType'
  | 'certStatus'
  | 'actionType'
  | 'actionSource'
  | 'resourceType'
  | 'riskTag'
  | 'issueCategory'
  | 'certainty'
  | 'privilege'
  | 'ease'
  | 'issueEvent'

export function humanizeEnum(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Returns `label(group, value)` that resolves an enum value to its localized display name. */
export function useEnumLabel() {
  const t = useTranslations('enumLabels')
  return (group: EnumGroup, value: string | null | undefined): string => {
    if (!value) return ''
    const key = `${group}.${value}`
    return t.has(key) ? t(key) : humanizeEnum(value)
  }
}
