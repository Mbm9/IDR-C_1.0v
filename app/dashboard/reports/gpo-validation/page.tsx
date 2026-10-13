'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { Printer, ShieldCheck, KeyRound, AlertOctagon, Scale, EyeOff } from 'lucide-react'
import { TierBadge } from '@/components/ui/tier-badge'
import { CsvExportButton } from '@/components/ui/csv-export-button'
import { ErrorState } from '@/components/ui/error-state'
import { toneBadge, severityTone, TONE_TEXT } from '@/components/ui/tone'
import { formatDateTime } from '@/lib/utils/formatters'
import type { GpoValidationReport, Finding, Severity } from '@/lib/reports/gpo-validation'

const card = 'bg-[var(--bg-primary)] rounded-[var(--radius-card)] border border-[var(--border-default)]'
const th = 'px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] whitespace-nowrap'
const td = 'px-3 py-2 align-top text-sm text-[var(--text-primary)]'

export default function GpoValidationReportPage() {
  const t = useTranslations('gpoReport')
  const tTier = useTranslations('tiers')
  const tSev = useTranslations('severity')
  const locale = useLocale()

  const { data, isLoading, isError, refetch } = useQuery<GpoValidationReport>({
    queryKey: ['gpo-validation-report'],
    queryFn: async () => {
      const res = await fetch('/api/reports/gpo-validation')
      if (!res.ok) throw new Error('report failed')
      return res.json()
    },
  })

  const tier = (v: string) => (tTier.has(v as any) ? tTier(v as any) : v)
  const perm = (v?: string) => (v && t.has(`permission.${v}` as any) ? t(`permission.${v}` as any) : v ?? '')
  const state = (v?: string | null) => (v && t.has(`state.${v}` as any) ? t(`state.${v}` as any) : v ?? '')

  const detail = (f: Finding): string => {
    const e = f.evidence
    switch (f.check) {
      case 'edit_right_below_tier':
        return f.trustee?.kind === 'group'
          ? t('detail.edit_right_below_tier_group', { trusteeTier: tier(String(e.trusteeTier)), gpoTier: tier(String(e.gpoTier)), members: Number(e.members ?? 0) })
          : t('detail.edit_right_below_tier', { trusteeTier: tier(String(e.trusteeTier)), gpoTier: tier(String(e.gpoTier)) })
      case 'tier0_admin_on_lower_tier':
        return t('detail.tier0_admin_on_lower_tier', { gpoTier: tier(String(e.gpoTier)) })
      case 'inactive_trustee':
        return e.daysSinceLogon == null
          ? t('detail.inactive_trustee_never', { status: state(String(e.status)) })
          : t('detail.inactive_trustee', { status: state(String(e.status)), days: Number(e.daysSinceLogon) })
      case 'link_tier_inversion':
      case 'link_scope_mismatch':
        return t(`detail.${f.check}`, { gpoTier: tier(String(e.gpoTier)), ouTier: tier(String(e.ouTier)) })
      case 'insecure_setting':
        return t('detail.insecure_setting', { setting: String(e.setting), actual: String(e.actual ?? '') })
      case 'baseline_drift':
        return t('detail.baseline_drift', { setting: String(e.setting), actual: String(e.actual ?? ''), expected: String(e.expected ?? ''), baseline: String(e.baseline ?? '') })
      default:
        return t(`detail.${f.check}` as any)
    }
  }

  if (isLoading) {
    return <div className="p-12 text-center text-[var(--text-secondary)] animate-pulse" role="status">{t('loading')}</div>
  }
  if (isError || !data) {
    return <ErrorState title={t('failed')} onRetry={() => refetch()} />
  }

  const { totals } = data
  const kpis = [
    { icon: ShieldCheck, label: t('kpi.gpoCompliance'), value: `${totals.gpoCompliancePct}%`, sub: t('kpi.ofTotal', { count: totals.compliantGpos, total: totals.gpos }), tone: totals.gpoCompliancePct >= 90 ? 'low' : 'critical' },
    { icon: KeyRound, label: t('kpi.editGrants'), value: `${totals.editGrantValidityPct}%`, sub: t('kpi.ofTotal', { count: totals.validEditGrants, total: totals.editGrants }), tone: totals.editGrantValidityPct >= 90 ? 'low' : 'critical' },
    { icon: AlertOctagon, label: t('kpi.critical'), value: String(totals.findingsBySeverity.critical), sub: `${tSev('high')}: ${totals.findingsBySeverity.high}`, tone: totals.findingsBySeverity.critical > 0 ? 'critical' : 'low' },
    { icon: Scale, label: t('kpi.policyCompliance'), value: `${totals.policyCompliancePct}%`, sub: t('kpi.ofTotal', { count: totals.identities - totals.identitiesWithOpenViolations, total: totals.identities }), tone: totals.policyCompliancePct >= 90 ? 'low' : 'high' },
    { icon: EyeOff, label: t('kpi.unrecorded'), value: String(totals.unrecordedPolicyFailures), sub: '', tone: totals.unrecordedPolicyFailures > 0 ? 'high' : 'low' },
  ] as const

  const findingRows = () => Promise.resolve(data.findings.map((f) => ({
    id: f.id, severity: f.severity, check: t(`checks.${f.check}` as any), gpo: f.gpoName, gpoTier: f.gpoTier,
    subject: f.trustee?.name ?? f.ou?.dn ?? '', permission: perm(f.permission), detail: detail(f), controls: f.controls.join(' '),
  })))
  const trusteeRows = () => Promise.resolve(data.trustees.map((r) => ({
    gpo: r.gpoName, gpoTier: r.gpoTier, account: r.trusteeName, accountTier: r.trusteeTier, permission: perm(r.permission),
    state: r.trusteeKind === 'group' ? t('group') : state(r.status), daysSinceLogon: r.daysSinceLogon ?? '',
    mfa: r.mfa == null ? '' : r.mfa ? t('yes') : t('no'), result: r.valid ? t('valid') : t('invalid'),
    checks: r.checks.map((c) => t(`checks.${c}` as any)).join('; '),
  })))

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title text-[var(--text-primary)]">{t('title')}</h1>
          <p className="text-caption text-[var(--text-secondary)] mt-1 max-w-3xl">{t('subtitle')}</p>
          <p className="text-micro text-[var(--text-secondary)] mt-1">{t('generatedAt', { date: formatDateTime(data.generatedAt, locale) })}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <CsvExportButton
            filename="gpo-validation-findings"
            label={t('exportFindings')}
            fetchData={findingRows}
            columns={[
              { key: 'id', label: 'ID' }, { key: 'severity', label: t('col.severity') }, { key: 'check', label: t('col.check') },
              { key: 'gpo', label: t('col.gpo') }, { key: 'gpoTier', label: 'Tier' }, { key: 'subject', label: t('col.subject') },
              { key: 'permission', label: t('col.permission') }, { key: 'detail', label: t('col.detail') }, { key: 'controls', label: t('col.controls') },
            ]}
          />
          <CsvExportButton
            filename="gpo-edit-grants"
            label={t('exportTrustees')}
            fetchData={trusteeRows}
            columns={[
              { key: 'gpo', label: t('col.gpo') }, { key: 'gpoTier', label: 'GPO tier' }, { key: 'account', label: t('col.account') },
              { key: 'accountTier', label: 'Account tier' }, { key: 'permission', label: t('col.permission') }, { key: 'state', label: t('col.state') },
              { key: 'daysSinceLogon', label: t('col.lastSignIn') }, { key: 'mfa', label: t('col.mfa') }, { key: 'result', label: t('col.result') }, { key: 'checks', label: t('col.check') },
            ]}
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-info)] text-white text-xs font-medium hover:opacity-90"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            {t('print')}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${card} p-4`}>
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <k.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{k.label}</span>
            </div>
            <p className={`text-2xl font-semibold mt-2 tabular-nums ${TONE_TEXT[k.tone]}`}>{k.value}</p>
            {k.sub && <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Findings */}
      <section className={card} aria-labelledby="findings-h">
        <div className="px-4 pt-4">
          <h2 id="findings-h" className="text-heading text-[var(--text-primary)]">{t('sections.findings')} ({data.findings.length})</h2>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">{t('sections.findingsHint')}</p>
        </div>
        {data.findings.length === 0 ? (
          <p className="p-4 text-sm text-[var(--text-secondary)]">{t('none')}</p>
        ) : (
          <div className="overflow-x-auto mt-3" tabIndex={0} role="region" aria-labelledby="findings-h">
            <table className="w-full">
              <thead className="border-y border-[var(--border-default)] bg-[var(--bg-secondary)]">
                <tr>
                  <th className={th}>{t('col.severity')}</th><th className={th}>{t('col.check')}</th><th className={th}>{t('col.gpo')}</th>
                  <th className={th}>{t('col.subject')}</th><th className={th}>{t('col.detail')}</th><th className={th}>{t('col.controls')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {data.findings.map((f) => (
                  <tr key={f.id} className="break-inside-avoid">
                    <td className={td}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${toneBadge(severityTone(f.severity))}`}>{tSev(f.severity as Severity)}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{t(`checks.${f.check}` as any)}</td>
                    <td className={td}><div className="flex items-center gap-2"><bdi>{f.gpoName}</bdi><TierBadge tier={f.gpoTier} showViolation={false} /></div></td>
                    <td className={td}>
                      {f.trustee ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <bdi>{f.trustee.name}</bdi>
                          <TierBadge tier={f.trustee.tier} showViolation={false} />
                          {f.permission && <span className="text-xs text-[var(--text-secondary)]">{perm(f.permission)}</span>}
                        </div>
                      ) : f.ou ? (
                        <code className="text-xs [overflow-wrap:anywhere]" dir="ltr">{f.ou.dn}</code>
                      ) : null}
                    </td>
                    <td className={`${td} min-w-[220px]`}>{detail(f)}</td>
                    <td className={`${td} text-xs text-[var(--text-secondary)]`}>
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5" dir="ltr">
                        {f.controls.map((c) => <span key={c} className="whitespace-nowrap">{c}</span>)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Edit grants */}
      <section className={card} aria-labelledby="trustees-h">
        <div className="px-4 pt-4">
          <h2 id="trustees-h" className="text-heading text-[var(--text-primary)]">{t('sections.trustees')} ({data.trustees.length})</h2>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">{t('sections.trusteesHint')}</p>
        </div>
        <div className="overflow-x-auto mt-3" tabIndex={0} role="region" aria-labelledby="trustees-h">
          <table className="w-full">
            <thead className="border-y border-[var(--border-default)] bg-[var(--bg-secondary)]">
              <tr>
                <th className={th}>{t('col.gpo')}</th><th className={th}>{t('col.account')}</th><th className={th}>{t('col.permission')}</th>
                <th className={th}>{t('col.state')}</th><th className={th}>{t('col.lastSignIn')}</th><th className={th}>{t('col.mfa')}</th><th className={th}>{t('col.result')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {data.trustees.map((r, i) => (
                <tr key={`${r.gpoName}-${r.trusteeName}-${r.permission}-${i}`} className="break-inside-avoid">
                  <td className={td}><div className="flex items-center gap-2"><bdi>{r.gpoName}</bdi><TierBadge tier={r.gpoTier} showViolation={false} /></div></td>
                  <td className={td}><div className="flex items-center gap-2"><bdi>{r.trusteeName}</bdi><TierBadge tier={r.trusteeTier} showViolation={false} /></div></td>
                  <td className={`${td} whitespace-nowrap`}>{perm(r.permission)}</td>
                  <td className={td}>{r.trusteeKind === 'group' ? t('group') : state(r.status)}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{r.trusteeKind === 'group' ? '' : r.daysSinceLogon == null ? t('never') : t('daysAgo', { days: r.daysSinceLogon })}</td>
                  <td className={td}>{r.mfa == null ? '' : r.mfa ? t('yes') : <span className={TONE_TEXT.high}>{t('no')}</span>}</td>
                  <td className={td}>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${toneBadge(r.valid ? 'low' : 'critical')}`}>{r.valid ? t('valid') : t('invalid')}</span>
                    {r.checks.length > 0 && (
                      <ul className="mt-1 text-xs text-[var(--text-secondary)] list-disc ps-4">
                        {r.checks.map((c) => <li key={c}>{t(`checks.${c}` as any)}</li>)}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* GPO status */}
        <section className={card} aria-labelledby="gpos-h">
          <div className="px-4 pt-4">
            <h2 id="gpos-h" className="text-heading text-[var(--text-primary)]">{t('sections.gpos')}</h2>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">{t('sections.gposHint')}</p>
          </div>
          <div className="overflow-x-auto mt-3" tabIndex={0} role="region" aria-labelledby="gpos-h">
            <table className="w-full">
              <thead className="border-y border-[var(--border-default)] bg-[var(--bg-secondary)]">
                <tr><th className={th}>{t('col.gpo')}</th><th className={th}>{t('col.editors')}</th><th className={th}>{t('col.findings')}</th><th className={th}>{t('col.result')}</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {data.gpos.map((g) => (
                  <tr key={g.gpoId} className="break-inside-avoid">
                    <td className={td}><div className="flex items-center gap-2"><bdi>{g.name}</bdi><TierBadge tier={g.tier} showViolation={false} /></div></td>
                    <td className={`${td} tabular-nums`}>{g.editors}</td>
                    <td className={`${td} tabular-nums`}>{g.findings}{g.worst && <span className={`ms-2 text-xs ${TONE_TEXT[severityTone(g.worst)]}`}>{tSev(g.worst)}</span>}</td>
                    <td className={td}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${toneBadge(g.compliant ? 'low' : 'critical')}`}>{g.compliant ? t('pass') : t('fail')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Policies */}
        <section className={card} aria-labelledby="policies-h">
          <div className="px-4 pt-4">
            <h2 id="policies-h" className="text-heading text-[var(--text-primary)]">{t('sections.policies')}</h2>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">{t('sections.policiesHint')}</p>
          </div>
          <div className="overflow-x-auto mt-3" tabIndex={0} role="region" aria-labelledby="policies-h">
            <table className="w-full">
              <thead className="border-y border-[var(--border-default)] bg-[var(--bg-secondary)]">
                <tr>
                  <th className={th}>{t('col.policy')}</th><th className={th}>{t('col.inScope')}</th><th className={th}>{t('col.recorded')}</th>
                  <th className={th}>{t('col.measured')}</th><th className={th}>{t('col.unrecorded')}</th><th className={th}>{t('col.compliance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {data.policies.map((p) => (
                  <tr key={p.policyId} className="break-inside-avoid">
                    <td className={td}>
                      <bdi>{p.name}</bdi>
                      <p className="text-xs text-[var(--text-secondary)]">{t(`scope.${p.scope}` as any)} · {tSev(p.severity)}</p>
                    </td>
                    <td className={`${td} tabular-nums`}>{p.inScope}</td>
                    <td className={`${td} tabular-nums`}>{p.recordedNonCompliant}</td>
                    <td className={`${td} tabular-nums`}>{p.measuredNonCompliant ?? t('notMeasurable')}</td>
                    <td className={`${td} tabular-nums`}>{p.unrecorded > 0 ? <span className={TONE_TEXT.high}>{p.unrecorded}</span> : 0}</td>
                    <td className={`${td} tabular-nums font-semibold ${TONE_TEXT[p.compliancePct >= 95 ? 'low' : p.compliancePct >= 80 ? 'medium' : 'critical']}`}>{p.compliancePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
