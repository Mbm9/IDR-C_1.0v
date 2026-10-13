'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { RiskGauge } from '@/components/ui/risk-gauge'
import { ActionDialog } from './action-dialog'
import { formatDate } from '@/lib/utils/formatters'
import { useAppRole } from '@/lib/hooks/use-app-role'
import { useEnumLabel } from '@/components/ui/enum-label'
import { TONE_TEXT, toneBadge, statusTone, tierTone } from '@/components/ui/tone'
import type { IdentityDetail } from '@/lib/hooks/use-identities'
import { AD_TIERS } from '@/lib/utils/tiers'

interface Props {
  data: IdentityDetail
}

type DialogType = 'update-tier' | 'trigger-review' | 'certify' | 'disable' | null

const TIER_KEYS = AD_TIERS

const inputClass =
  'w-full border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] resize-none'

function DialogError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="bg-[var(--color-critical-bg)] border border-[var(--color-critical)] rounded-lg p-3" role="alert">
      <p className={`text-sm ${TONE_TEXT.critical}`}>{message}</p>
    </div>
  )
}

export function IdentityDetailHeader({ data }: Props) {
  const t = useTranslations('identityDetail')
  const tTiers = useTranslations('tiers')
  const tStatus = useTranslations('status')
  const locale = useLocale()
  const label = useEnumLabel()
  const { can } = useAppRole()
  const { identity, manager, owner } = data
  const tierKey = (TIER_KEYS as readonly string[]).includes(identity.adTier) ? identity.adTier : 'unclassified'

  const [openDialog, setOpenDialog] = useState<DialogType>(null)
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  // Form state for dialogs
  const [newTier, setNewTier] = useState(identity.adTier)
  const [rationale, setRationale] = useState('')
  const [disableReason, setDisableReason] = useState('')

  const closeDialog = () => {
    setOpenDialog(null)
    setDialogLoading(false)
    setDialogError(null)
    setRationale('')
    setDisableReason('')
  }

  const post = async (url: string, body: unknown, fallbackError: string) => {
    setDialogLoading(true)
    setDialogError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || fallbackError)
      }
      closeDialog()
      window.location.reload()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : fallbackError)
      setDialogLoading(false)
    }
  }

  const handleUpdateTier = () =>
    post('/api/actions/update-tier', { identityId: identity.id, newTier, rationale }, t('errorUpdateTier'))

  const handleTriggerReview = (reviewType: string) =>
    post('/api/actions/trigger-review', { identityIds: [identity.id], reviewType }, t('errorTriggerReview'))

  const handleDisable = () =>
    post('/api/actions/escalate', { identityId: identity.id, reason: disableReason, action: 'disable' }, t('errorDisable'))

  const quality = identity.dataQuality?.score

  // Role required by each action's API route: trigger-review / escalate = analyst,
  // update-tier = iam_admin. Certify and disable stay with IAM admins by policy.
  const canReview = can('analyst')
  const canAdmin = can('iam_admin')

  const strong = (chunks: ReactNode) => <bdi className="font-medium text-[var(--text-primary)]">{chunks}</bdi>

  return (
    <>
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          {/* Identity info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl" aria-hidden="true">{identity.type === 'human' ? '\u{1F464}' : '\u{1F916}'}</span>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-[var(--text-primary)] break-words"><bdi>{identity.displayName}</bdi></h2>
                {identity.upn && (
                  <p className="text-sm text-[var(--text-secondary)] break-all"><bdi>{identity.upn}</bdi></p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(tierTone(tierKey))}`}>
                {tTiers(tierKey)}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(statusTone(identity.status))}`}>
                {tStatus.has(identity.status) ? tStatus(identity.status) : label('findingStatus', identity.status)}
              </span>
              {identity.tierViolation && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge('critical')}`}>
                  {t('tierViolation')}
                </span>
              )}
              {quality ? (
                <>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge(quality > 80 ? 'low' : quality > 50 ? 'medium' : 'critical')}`}>
                    {t('qualityScore', { score: quality })}
                  </span>
                  {quality < 60 && (
                    <Link href="/dashboard/data-quality" className={`text-xs hover:underline self-center ${TONE_TEXT.info}`}>
                      {t('improveData')}
                    </Link>
                  )}
                </>
              ) : null}
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${toneBadge('neutral')}`}>
                {label('subType', identity.subType)}
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
              {identity.department && (
                <div className="flex gap-1 min-w-0">
                  <dt className="text-[var(--text-secondary)] shrink-0">{t('department')}:</dt>
                  <dd className="text-[var(--text-primary)] truncate">{identity.department}</dd>
                </div>
              )}
              {identity.email && (
                <div className="flex gap-1 min-w-0">
                  <dt className="text-[var(--text-secondary)] shrink-0">{t('email')}:</dt>
                  <dd className="text-[var(--text-primary)] truncate"><bdi>{identity.email}</bdi></dd>
                </div>
              )}
              {manager && (
                <div className="flex gap-1 min-w-0">
                  <dt className="text-[var(--text-secondary)] shrink-0">{t('manager')}:</dt>
                  <dd className="truncate">
                    <Link href={`/dashboard/identities/${manager.id}`} className={`hover:underline ${TONE_TEXT.info}`}>
                      <bdi>{manager.displayName}</bdi>
                    </Link>
                  </dd>
                </div>
              )}
              {owner && (
                <div className="flex gap-1 min-w-0">
                  <dt className="text-[var(--text-secondary)] shrink-0">{t('owner')}:</dt>
                  <dd className="truncate">
                    <Link href={`/dashboard/identities/${owner.id}`} className={`hover:underline ${TONE_TEXT.info}`}>
                      <bdi>{owner.displayName}</bdi>
                    </Link>
                  </dd>
                </div>
              )}
              {identity.lastLogonAt && (
                <div className="flex gap-1 min-w-0">
                  <dt className="text-[var(--text-secondary)] shrink-0">{t('lastLogon')}:</dt>
                  <dd className="text-[var(--text-primary)]">{formatDate(identity.lastLogonAt, locale)}</dd>
                </div>
              )}
              <div className="flex gap-1 min-w-0">
                <dt className="text-[var(--text-secondary)] shrink-0">{t('source')}:</dt>
                <dd className="text-[var(--text-primary)]">{label('sourceSystem', identity.sourceSystem)}</dd>
              </div>
            </dl>
          </div>

          {/* Risk gauge + actions */}
          <div className="flex flex-col items-center gap-4">
            <RiskGauge score={identity.riskScore} label={t('riskScore')} size="lg" />

            {(canReview || canAdmin) && (
              <div className="flex flex-wrap justify-center gap-2">
                {canReview && (
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity ${toneBadge('info')}`}
                    onClick={() => setOpenDialog('trigger-review')}
                  >
                    {t('triggerReview')}
                  </button>
                )}
                {canAdmin && (
                  <>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity ${toneBadge('high')}`}
                      onClick={() => {
                        setNewTier(identity.adTier)
                        setOpenDialog('update-tier')
                      }}
                    >
                      {t('updateTier')}
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity ${toneBadge('low')}`}
                      onClick={() => setOpenDialog('certify')}
                    >
                      {t('certifyAll')}
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity ${toneBadge('critical')}`}
                      onClick={() => setOpenDialog('disable')}
                    >
                      {t('disable')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Update Tier Dialog */}
      <ActionDialog
        isOpen={openDialog === 'update-tier'}
        onClose={closeDialog}
        title={t('updateTierTitle')}
        onConfirm={handleUpdateTier}
        confirmLabel={t('updateTier')}
        loading={dialogLoading}
      >
        <DialogError message={dialogError} />
        <div>
          <label htmlFor="identity-new-tier" className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('newTier')}</label>
          <select
            id="identity-new-tier"
            value={newTier}
            onChange={(e) => setNewTier(e.target.value)}
            className={inputClass}
          >
            {TIER_KEYS.map((k) => (
              <option key={k} value={k}>{t(`tierOption.${k}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="identity-tier-rationale" className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('rationale')}</label>
          <textarea
            id="identity-tier-rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            placeholder={t('rationalePlaceholder')}
            className={inputClass}
          />
        </div>
      </ActionDialog>

      {/* Trigger Review Dialog */}
      <ActionDialog
        isOpen={openDialog === 'trigger-review'}
        onClose={closeDialog}
        title={t('triggerReviewTitle')}
        onConfirm={() => handleTriggerReview('access')}
        confirmLabel={t('triggerReview')}
        loading={dialogLoading}
      >
        <DialogError message={dialogError} />
        <p className="text-sm text-[var(--text-secondary)]">
          {t.rich('triggerReviewBody', { name: identity.displayName, strong })}
        </p>
      </ActionDialog>

      {/* Certify All Dialog */}
      <ActionDialog
        isOpen={openDialog === 'certify'}
        onClose={closeDialog}
        title={t('certifyTitle')}
        onConfirm={() => handleTriggerReview('certification')}
        confirmLabel={t('certifyAll')}
        loading={dialogLoading}
      >
        <DialogError message={dialogError} />
        <p className="text-sm text-[var(--text-secondary)]">
          {t.rich('certifyBody', { name: identity.displayName, strong })}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          {t('certifyCount', { count: data.entitlements.length })}
        </p>
      </ActionDialog>

      {/* Disable Identity Dialog */}
      <ActionDialog
        isOpen={openDialog === 'disable'}
        onClose={closeDialog}
        title={t('disableTitle')}
        onConfirm={handleDisable}
        confirmLabel={t('disableConfirm')}
        confirmVariant="destructive"
        loading={dialogLoading}
      >
        <DialogError message={dialogError} />
        <div className="bg-[var(--color-critical-bg)] border border-[var(--color-critical)] rounded-lg p-3">
          <p className={`text-sm font-medium ${TONE_TEXT.critical}`}>{t('warning')}</p>
          <p className={`text-sm mt-1 ${TONE_TEXT.critical}`}>{t('disableWarning')}</p>
        </div>
        <div>
          <label htmlFor="identity-disable-reason" className="block text-sm font-medium text-[var(--text-primary)] mb-1">{t('disableReason')}</label>
          <textarea
            id="identity-disable-reason"
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            rows={3}
            placeholder={t('disableReasonPlaceholder')}
            className={inputClass}
          />
        </div>
      </ActionDialog>
    </>
  )
}
