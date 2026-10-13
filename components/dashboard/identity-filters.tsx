'use client'

import { useTranslations } from 'next-intl'

interface IdentityFiltersProps {
  filters: Record<string, string>
  onChange: (key: string, value: string) => void
  onReset: () => void
}

function SelectFilter({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)]"
      aria-label={label}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

export function IdentityFilters({ filters, onChange, onReset }: IdentityFiltersProps) {
  const t = useTranslations('identity')
  const tTiers = useTranslations('tiers')
  const tStatus = useTranslations('status')
  const tSources = useTranslations('sources')
  const tCommon = useTranslations('common')
  const tf = useTranslations('identityTable')

  const TYPE_OPTIONS = [
    { value: '', label: t('allTypes') },
    { value: 'human', label: t('human') },
    { value: 'non_human', label: t('non_human') },
  ]

  const SUB_TYPE_OPTIONS = [
    { value: '', label: t('allSubTypes') },
    { value: 'employee', label: t('employee') },
    { value: 'contractor', label: t('contractor') },
    { value: 'vendor', label: t('vendor') },
    { value: 'service_account', label: t('service_account') },
    { value: 'managed_identity', label: t('managed_identity') },
    { value: 'app_registration', label: t('app_registration') },
    { value: 'api_key', label: t('api_key') },
    { value: 'bot', label: t('bot') },
    { value: 'machine', label: t('machine') },
    { value: 'certificate', label: t('certificate') },
  ]

  const TIER_OPTIONS = [
    { value: '', label: tTiers('allTiers') },
    { value: 'tier_0', label: tTiers('tier_0') },
    { value: 'tier_1', label: tTiers('tier_1') },
    { value: 'tier_2', label: tTiers('tier_2') },
    { value: 'unclassified', label: tTiers('unclassified') },
  ]

  const STATUS_OPTIONS = [
    { value: '', label: tStatus('allStatuses') },
    { value: 'active', label: tStatus('active') },
    { value: 'inactive', label: tStatus('inactive') },
    { value: 'disabled', label: tStatus('disabled') },
    { value: 'dormant', label: tStatus('dormant') },
    { value: 'orphaned', label: tStatus('orphaned') },
    { value: 'suspended', label: tStatus('suspended') },
  ]

  const SOURCE_OPTIONS = [
    { value: '', label: tSources('allSources') },
    { value: 'active_directory', label: tSources('active_directory') },
    { value: 'azure_ad', label: tSources('azure_ad') },
    { value: 'okta', label: tSources('okta') },
    { value: 'sailpoint', label: tSources('sailpoint') },
    { value: 'cyberark', label: tSources('cyberark') },
    { value: 'manual', label: tSources('manual') },
  ]

  const hasFilters = Object.values(filters).some(v => v !== '' && v !== undefined)

  return (
    <div className="space-y-3" role="search" aria-label={tf('filtersLabel')}>
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          aria-label={tf('searchLabel')}
          placeholder={t('searchPlaceholder')}
          value={filters.search || ''}
          onChange={(e) => onChange('search', e.target.value)}
          className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm w-full sm:w-64 bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)]"
        />
        <SelectFilter label={tf('filterType')} value={filters.type || ''} options={TYPE_OPTIONS} onChange={(v) => onChange('type', v)} />
        <SelectFilter label={tf('filterSubType')} value={filters.subType || ''} options={SUB_TYPE_OPTIONS} onChange={(v) => onChange('subType', v)} />
        <SelectFilter label={tf('filterTier')} value={filters.adTier || ''} options={TIER_OPTIONS} onChange={(v) => onChange('adTier', v)} />
        <SelectFilter label={tf('filterStatus')} value={filters.status || ''} options={STATUS_OPTIONS} onChange={(v) => onChange('status', v)} />
        <SelectFilter label={tf('filterSource')} value={filters.sourceSystem || ''} options={SOURCE_OPTIONS} onChange={(v) => onChange('sourceSystem', v)} />

        <SelectFilter
          label={tf('filterVelocity')}
          value={filters.velocityDirection || ''}
          options={[
            { value: '', label: tf('allVelocities') },
            { value: 'deteriorating', label: t('deteriorating') },
            { value: 'improving', label: t('improving') },
            { value: 'stable', label: t('stable') },
          ]}
          onChange={(v) => onChange('velocityDirection', v)}
        />

        <label className="flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] cursor-pointer">
          <input
            type="checkbox"
            checked={filters.tierViolation === 'true'}
            onChange={(e) => onChange('tierViolation', e.target.checked ? 'true' : '')}
            className="rounded"
          />
          {t('tierViolationsOnly')}
        </label>

        {hasFilters && (
          <button
            onClick={onReset}
            className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {tCommon('clearFilters')}
          </button>
        )}
      </div>
    </div>
  )
}
