'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { formatRelativeTime } from '@/lib/utils/formatters'
import { ExportPdfButton } from '@/components/dashboard/export-pdf-button'

const ACTION_TYPE_KEYS: Record<string, string> = {
  assess_identity: 'assessIdentity',
  certify_entitlement: 'certifyEntitlement',
  revoke_access: 'revokeAccess',
  approve_exception: 'approveException',
  escalate_risk: 'escalateRisk',
  trigger_review: 'triggerReview',
  update_tier: 'updateTier',
  sync_source: 'syncSource',
  generate_recommendation: 'generateRecommendation',
  acknowledge_violation: 'acknowledgeViolation',
  change_role: 'changeRole',
  invite_user: 'inviteUser',
  manage_integration: 'manageIntegration',
  manage_api_key: 'manageApiKey',
  login_success: 'loginSuccess',
  login_failed: 'loginFailed',
  manage_canary: 'manageCanary',
  manage_detection_rule: 'manageDetectionRule',
  manage_automation_rule: 'manageAutomationRule',
  manage_webhook: 'manageWebhook',
  manage_gpo: 'manageGpo',
  import_data: 'importData',
  data_quality_action: 'dataQualityAction',
  update_threat_status: 'updateThreatStatus',
  update_finding_status: 'updateFindingStatus',
  run_scan: 'runScan',
  manage_remediation: 'manageRemediation',
  manage_branding: 'manageBranding',
}

const SOURCE_STYLES: Record<string, string> = {
  manual: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  automated: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  ai_recommended: 'bg-purple-50 text-purple-700',
}

export default function AuditPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const t = useTranslations('audit')
  const tCommon = useTranslations('common')

  const { data, isLoading } = useQuery({
    queryKey: ['audit', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '25', ...filters })
      const res = await fetch(`/api/audit?${params}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  const handleFilter = useCallback((key: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev }
      if (!value) delete next[key]
      else next[key] = value
      return next
    })
    setPage(1)
  }, [])

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <ExportPdfButton reportType="audit_trail" label={tCommon('export')} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t('allActions')}
          value={filters.actionType || ''}
          onChange={(e) => handleFilter('actionType', e.target.value)}
          className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)]"
        >
          <option value="">{t('allActions')}</option>
          {Object.entries(ACTION_TYPE_KEYS).map(([val, key]) => (
            <option key={val} value={val}>{t(key as any)}</option>
          ))}
        </select>
        <select
          aria-label={t('allSources')}
          value={filters.source || ''}
          onChange={(e) => handleFilter('source', e.target.value)}
          className="px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)]"
        >
          <option value="">{t('allSources')}</option>
          <option value="manual">{t('manual')}</option>
          <option value="automated">{t('automated')}</option>
          <option value="ai_recommended">{t('aiRecommended')}</option>
        </select>
        {data && <span className="flex items-center text-sm text-[var(--text-secondary)]">{data.total} {tCommon('entries')}</span>}
      </div>

      {/* Timeline */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        {isLoading ? (
          <div className="p-12 text-center text-[var(--text-tertiary)] animate-pulse">{t('loadingAudit')}</div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center text-[var(--text-tertiary)]">{t('noEntries')}</div>
        ) : (
          <div className="divide-y divide-[var(--border-default)]">
            {data.data.map((entry: any) => (
              <div key={entry.id} className="p-4 hover:bg-[var(--bg-secondary)] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-[var(--color-info)] mt-2 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {ACTION_TYPE_KEYS[entry.actionType] ? t(ACTION_TYPE_KEYS[entry.actionType] as any) : entry.actionType}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SOURCE_STYLES[entry.source] || ''}`}>
                          {entry.source === 'manual' ? t('manual') : entry.source === 'automated' ? t('automated') : t('aiRecommended')}
                        </span>
                      </div>
                      {entry.actorName && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 [overflow-wrap:anywhere]">{tCommon('by')} <bdi>{entry.actorName}</bdi></p>
                      )}
                      {entry.rationale && (
                        <p className="text-sm text-[var(--text-secondary)] mt-1 [overflow-wrap:anywhere]">{entry.rationale}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)]">
            <p className="text-sm text-[var(--text-secondary)]">{tCommon('page')} {page} {tCommon('of')} {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 hover:bg-[var(--bg-secondary)]">{tCommon('previous')}</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 hover:bg-[var(--bg-secondary)]">{tCommon('next')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
