'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader2, Download, Zap, Users, Shield, Key, FileText, Copy, Lock } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useRoleHint } from '@/lib/hooks/use-role-hint'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ColumnMapping {
  sourceColumn: string
  targetField: string
  confidence: number
  sampleValue: string
}

interface FileUpload {
  file: File | null
  content: string
  status: 'idle' | 'detecting' | 'mapped' | 'importing' | 'done' | 'error'
  mappings: ColumnMapping[]
  detectedFormat: string
  rowCount: number
  importedCount: number
  error: string
}

/** Target identity fields; labels are message keys under import.fields (empty value = skip). */
const TARGET_FIELDS = [
  '',
  'displayName',
  'samAccountName',
  'upn',
  'email',
  'department',
  'type',
  'subType',
  'status',
  'adTier',
  'manager',
  'memberOf',
  'lastLogon',
  'passwordLastSet',
  'whenCreated',
  'userAccountControl',
  'distinguishedName',
  'description',
  'title',
  'sourceId',
  'name',
  'members',
  'groupScope',
  'groupCategory',
  'permissionName',
  'resourceName',
  'permissionScope',
] as const

/* ------------------------------------------------------------------ */
/*  PowerShell Commands                                                */
/* ------------------------------------------------------------------ */

const PS_COMMANDS = {
  users: `Get-ADUser -Filter * -Properties DisplayName,SamAccountName,
UserPrincipalName,EmailAddress,Department,Manager,MemberOf,
Enabled,LastLogonDate,PasswordLastSet,WhenCreated,
UserAccountControl,DistinguishedName,Description,Title |
Select-Object DisplayName,SamAccountName,UserPrincipalName,
EmailAddress,Department,
@{N='Manager';E={($_.Manager -split ',')[0] -replace 'CN=',''}},
@{N='MemberOf';E={($_.MemberOf | ForEach-Object {
  ($_ -split ',')[0] -replace 'CN=','' }) -join ';'}},
Enabled,
@{N='LastLogon';E={if($_.LastLogonDate){$_.LastLogonDate.ToString('yyyy-MM-dd')}}},
@{N='PasswordLastSet';E={if($_.PasswordLastSet){$_.PasswordLastSet.ToString('yyyy-MM-dd')}}},
@{N='WhenCreated';E={$_.WhenCreated.ToString('yyyy-MM-dd')}},
UserAccountControl,DistinguishedName,Description,Title |
Export-Csv -Path C:\\ir-users.csv -NoTypeInformation -Encoding UTF8`,

  groups: `Get-ADGroup -Filter * -Properties Members,Description,
GroupScope,GroupCategory,ManagedBy,DistinguishedName |
Select-Object Name,
@{N='Members';E={($_.Members | ForEach-Object {
  ($_ -split ',')[0] -replace 'CN=','' }) -join ';'}},
Description,GroupScope,GroupCategory,
@{N='ManagedBy';E={($_.ManagedBy -split ',')[0] -replace 'CN=',''}},
DistinguishedName |
Export-Csv -Path C:\\ir-groups.csv -NoTypeInformation -Encoding UTF8`,

  permissions: `# Export GPO permissions + delegations
Get-GPO -All | ForEach-Object {
  $gpo = $_
  Get-GPPermissions -Guid $_.Id -All | ForEach-Object {
    [PSCustomObject]@{
      GPOName = $gpo.DisplayName
      Trustee = $_.Trustee.Name
      Permission = $_.Permission
      TrusteeType = $_.Trustee.SidType
    }
  }
} | Export-Csv -Path C:\\ir-permissions.csv -NoTypeInformation -Encoding UTF8`,
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const DATA_TYPES = [
  {
    key: 'users' as const,
    icon: Users,
    fileName: 'ir-users.csv',
    required: true,
    unlocks: ['inventory', 'classification', 'dormancy', 'departments', 'managers'],
  },
  {
    key: 'groups' as const,
    icon: Shield,
    fileName: 'ir-groups.csv',
    required: true,
    unlocks: ['tiering', 'tierViolations', 'privilegedGroups', 'nestedGroups', 'attackPaths'],
  },
  {
    key: 'permissions' as const,
    icon: Key,
    fileName: 'ir-permissions.csv',
    required: false,
    unlocks: ['gpoRisks', 'shadowAdmins', 'delegations', 'attackPathEnrichment'],
  },
]

export default function ImportPage() {
  const t = useTranslations('import')
  const format = useFormatter()
  const { can, hint, roleName, loading: roleLoading } = useRoleHint()
  const canImport = can('iam_admin')
  const [uploads, setUploads] = useState<Record<string, FileUpload>>({
    users: { file: null, content: '', status: 'idle', mappings: [], detectedFormat: '', rowCount: 0, importedCount: 0, error: '' },
    groups: { file: null, content: '', status: 'idle', mappings: [], detectedFormat: '', rowCount: 0, importedCount: 0, error: '' },
    permissions: { file: null, content: '', status: 'idle', mappings: [], detectedFormat: '', rowCount: 0, importedCount: 0, error: '' },
  })
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'review'>('export')
  const [copied, setCopied] = useState('')
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const allDone = uploads.users.status === 'done' && uploads.groups.status === 'done'
  const anyImporting = Object.values(uploads).some(u => u.status === 'importing' || u.status === 'detecting')

  function copyCommand(key: string) {
    navigator.clipboard?.writeText(PS_COMMANDS[key as keyof typeof PS_COMMANDS]).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  async function handleFileSelect(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return

    const text = await f.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) {
      setUploads(prev => ({ ...prev, [key]: { ...prev[key], file: f, error: t('errors.tooFewRows'), status: 'error' } }))
      return
    }

    setUploads(prev => ({ ...prev, [key]: { ...prev[key], file: f, content: text, status: 'detecting', error: '' } }))

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
    const sampleRows = lines.slice(1, 6).map(line => line.split(',').map(v => v.trim().replace(/^["']|["']$/g, '')))

    try {
      const res = await fetch('/api/import/csv-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, sampleRows }),
      })

      if (!res.ok) throw new Error('Detection failed')
      const data = await res.json()

      const mappings: ColumnMapping[] = headers.map((h, i) => ({
        sourceColumn: h,
        targetField: data.mappings?.[h] || '',
        confidence: data.confidence?.[h] || 0,
        sampleValue: sampleRows[0]?.[i] || '',
      }))

      setUploads(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          status: 'mapped',
          mappings,
          detectedFormat: data.format || 'CSV',
          rowCount: lines.length - 1,
        },
      }))
    } catch {
      // Fallback: manual mapping
      const mappings: ColumnMapping[] = headers.map((h, i) => ({
        sourceColumn: h,
        targetField: '',
        confidence: 0,
        sampleValue: sampleRows[0]?.[i] || '',
      }))
      setUploads(prev => ({
        ...prev,
        [key]: { ...prev[key], status: 'mapped', mappings, detectedFormat: '', rowCount: lines.length - 1 },
      }))
    }
  }

  function handleMappingChange(key: string, index: number, targetField: string) {
    setUploads(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        mappings: prev[key].mappings.map((m, i) => i === index ? { ...m, targetField } : m),
      },
    }))
  }

  async function handleImport(key: string) {
    const upload = uploads[key]
    if (!upload.content) return

    setUploads(prev => ({ ...prev, [key]: { ...prev[key], status: 'importing', error: '' } }))

    try {
      const mappingObj: Record<string, string> = {}
      for (const m of upload.mappings) {
        if (m.targetField) mappingObj[m.sourceColumn] = m.targetField
      }

      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent: upload.content, mapping: mappingObj }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('errors.importFailed'))
      }

      const data = await res.json()
      setUploads(prev => ({
        ...prev,
        [key]: { ...prev[key], status: 'done', importedCount: data.identities || data.recordCount || upload.rowCount, error: '' },
      }))
    } catch (err: any) {
      setUploads(prev => ({ ...prev, [key]: { ...prev[key], status: 'mapped', error: err.message || t('errors.importFailed') } }))
    }
  }

  async function handleLoadDemo() {
    setUploads(prev => ({ ...prev, users: { ...prev.users, status: 'importing' }, groups: { ...prev.groups, status: 'importing' } }))
    try {
      const res = await fetch('/api/import/demo', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || t('errors.demoFailed'))
      }
      const data = await res.json()
      setUploads(prev => ({
        ...prev,
        users: { ...prev.users, status: 'done', importedCount: data.identities || 50 },
        groups: { ...prev.groups, status: 'done', importedCount: data.groups || 20 },
      }))
      setActiveTab('review')
    } catch (err: any) {
      setUploads(prev => ({
        ...prev,
        users: { ...prev.users, status: 'error', error: err.message || t('errors.demoFailed') },
        groups: { ...prev.groups, status: 'idle' },
      }))
    }
  }

  function openPicker(key: string) {
    if (canImport) fileRefs.current[key]?.click()
  }

  const tabs = [
    { id: 'export' as const, label: t('steps.export'), icon: Download },
    { id: 'import' as const, label: t('steps.upload'), icon: Upload },
    { id: 'review' as const, label: t('steps.review'), icon: CheckCircle },
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-title text-[var(--text-primary)]">{t('title')}</h2>
        <p className="text-caption text-[var(--text-secondary)] mt-1">
          {t('intro')}
        </p>
      </div>

      {!roleLoading && !canImport && (
        <div className="flex items-start gap-2 rounded-lg border px-4 py-3 text-xs text-[var(--text-primary)]" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-secondary)' }} role="note">
          <Lock className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
          <span>{t('readOnly', { role: roleName('iam_admin') })}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border-default)' }} role="tablist" aria-label={t('stepsLabel')}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-[var(--color-info)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Export Instructions */}
      {activeTab === 'export' && (
        <div className="space-y-4">
          <div className="rounded-lg p-4 border-s-[3px]" style={{ backgroundColor: 'var(--color-info-bg)', borderColor: 'var(--color-info)' }}>
            <p className="text-xs text-[var(--text-primary)]">
              {t.rich('exportIntro', { strong: (chunks) => <strong>{chunks}</strong> })}
            </p>
          </div>

          {DATA_TYPES.map((dt, i) => (
            <div key={dt.key} className="rounded-lg border p-4" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <dt.icon className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                      {t('commandHeading', { number: i + 1, label: t(`dataTypes.${dt.key}.label`) })}
                      {dt.required ? (
                        <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold border" style={{ borderColor: 'var(--color-critical)', color: 'var(--text-primary)' }}>{t('required')}</span>
                      ) : (
                        <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{t('optional')}</span>
                      )}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">{t(`dataTypes.${dt.key}.description`)}</p>
                  </div>
                </div>
                <button
                  onClick={() => copyCommand(dt.key)}
                  aria-label={t('copyCommand', { number: i + 1 })}
                  className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors text-[var(--text-primary)]"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  {copied === dt.key ? <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span aria-live="polite">{copied === dt.key ? t('copied') : t('copy')}</span>
                </button>
              </div>

              <pre dir="ltr" tabIndex={0} aria-label={t('commandHeading', { number: i + 1, label: t(`dataTypes.${dt.key}.label`) })} className="text-[11px] font-mono p-3 rounded-md overflow-x-auto leading-relaxed text-start" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                {PS_COMMANDS[dt.key as keyof typeof PS_COMMANDS]}
              </pre>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('unlocksLabel')}</span>
                {dt.unlocks.map(u => (
                  <span key={u} className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                    {t(`unlocks.${u}`)}
                  </span>
                ))}
              </div>

              <p className="text-[11px] text-[var(--text-secondary)] mt-2">
                {t('outputFile')} <code className="font-mono" dir="ltr">C:\{dt.fileName}</code>
              </p>
            </div>
          ))}

          <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
            {canImport ? (
              <button
                onClick={handleLoadDemo}
                disabled={anyImporting}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 text-[var(--text-primary)]"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                {t('loadDemo')}
              </button>
            ) : (
              <button
                disabled
                title={hint('iam_admin')}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg opacity-60 cursor-not-allowed text-[var(--text-primary)]"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                {t('loadDemo')}
              </button>
            )}
            <button
              onClick={() => setActiveTab('import')}
              className="px-6 py-2.5 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: 'var(--color-info)' }}
            >
              {t('haveFiles')} <span aria-hidden="true" className="rtl:inline-block rtl:-scale-x-100">→</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Upload Files */}
      {activeTab === 'import' && (
        <div className="space-y-4">
          {DATA_TYPES.map(dt => {
            const upload = uploads[dt.key]
            const label = t(`dataTypes.${dt.key}.label`)
            return (
              <div key={dt.key} className="rounded-lg border p-4" style={{ borderColor: upload.status === 'done' ? 'var(--color-success)' : upload.status === 'error' ? 'var(--color-critical)' : 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <dt.icon className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h3>
                      <p className="text-[11px] text-[var(--text-secondary)]" dir="ltr">{dt.fileName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" aria-live="polite">
                    {upload.status === 'done' && <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-primary)]"><CheckCircle className="w-4 h-4" style={{ color: 'var(--color-success)' }} aria-hidden="true" /> {t('importedCount', { count: upload.importedCount })}</span>}
                    {upload.status === 'detecting' && <span className="flex items-center gap-1 text-xs text-[var(--text-primary)]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('detecting')}</span>}
                    {upload.status === 'importing' && <span className="flex items-center gap-1 text-xs text-[var(--text-primary)]"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('importing')}</span>}
                    {!dt.required && upload.status === 'idle' && <span className="text-[11px] text-[var(--text-secondary)]">{t('optional')}</span>}
                  </div>
                </div>

                {upload.error && (
                  <div role="alert" className="flex items-start gap-2 p-2 rounded mb-3 text-xs border text-[var(--text-primary)]" style={{ borderColor: 'var(--color-critical)', backgroundColor: 'var(--color-critical-bg)' }}>
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--color-critical)' }} aria-hidden="true" />
                    <bdi>{upload.error}</bdi>
                  </div>
                )}

                {upload.status === 'idle' || upload.status === 'error' ? (
                  <div
                    role={canImport ? 'button' : undefined}
                    tabIndex={canImport ? 0 : undefined}
                    aria-disabled={canImport ? undefined : true}
                    title={canImport ? undefined : hint('iam_admin')}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${canImport ? 'cursor-pointer hover:border-[var(--color-info)]' : 'cursor-not-allowed opacity-60'}`}
                    style={{ borderColor: 'var(--border-default)' }}
                    onClick={() => openPicker(dt.key)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(dt.key) } }}
                    onDragOver={e => { if (!canImport) return; e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-info)' }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)' }}
                    onDrop={e => {
                      e.preventDefault()
                      e.currentTarget.style.borderColor = 'var(--border-default)'
                      if (!canImport) return
                      const f = e.dataTransfer.files[0]
                      if (f && fileRefs.current[dt.key]) {
                        const dtr = new DataTransfer()
                        dtr.items.add(f)
                        fileRefs.current[dt.key]!.files = dtr.files
                        fileRefs.current[dt.key]!.dispatchEvent(new Event('change', { bubbles: true }))
                      }
                    }}
                  >
                    <input
                      ref={el => { fileRefs.current[dt.key] = el }}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      aria-label={label}
                      tabIndex={-1}
                      disabled={!canImport}
                      onChange={e => handleFileSelect(dt.key, e)}
                    />
                    <Upload className="w-6 h-6 mx-auto mb-2 text-[var(--text-secondary)]" aria-hidden="true" />
                    <p className="text-xs text-[var(--text-secondary)]">
                      {canImport
                        ? t.rich('dropHere', { file: dt.fileName, code: (chunks) => <code className="font-mono" dir="ltr">{chunks}</code> })
                        : hint('iam_admin')}
                    </p>
                  </div>
                ) : upload.status === 'mapped' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                      <span>
                        {upload.detectedFormat
                          ? t.rich('detectedSummary', { format: upload.detectedFormat, count: upload.rowCount, strong: (chunks) => <strong><bdi>{chunks}</bdi></strong> })
                          : t('rowsOnly', { count: upload.rowCount })}
                      </span>
                      <button onClick={() => setUploads(prev => ({ ...prev, [dt.key]: { ...prev[dt.key], status: 'idle', file: null, content: '', mappings: [] } }))} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">
                        {t('removeFile')}
                      </button>
                    </div>
                    <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border-default)' }}>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                            <th scope="col" className="px-2 py-1.5 text-start font-semibold text-[var(--text-secondary)]">{t('column')}</th>
                            <th scope="col" className="px-2 py-1.5 text-start font-semibold text-[var(--text-secondary)]">{t('sample')}</th>
                            <th scope="col" className="px-2 py-1.5 text-start font-semibold text-[var(--text-secondary)]">{t('mapsTo')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {upload.mappings.map((m, i) => (
                            <tr key={i} className="border-t" style={{ borderColor: 'var(--border-default)' }}>
                              <td className="px-2 py-1 font-mono text-[var(--text-primary)]" dir="ltr">{m.sourceColumn}</td>
                              <td className="px-2 py-1 text-[var(--text-secondary)] max-w-[150px] truncate"><bdi>{m.sampleValue}</bdi></td>
                              <td className="px-2 py-1">
                                <select
                                  value={m.targetField}
                                  onChange={e => handleMappingChange(dt.key, i, e.target.value)}
                                  aria-label={t('mapColumn', { column: m.sourceColumn })}
                                  disabled={!canImport}
                                  className="w-full px-1 py-0.5 rounded text-[11px] border"
                                  style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                                >
                                  {TARGET_FIELDS.map(f => (
                                    <option key={f} value={f}>{f ? t(`fields.${f}`) : t('skipField')}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={() => handleImport(dt.key)}
                      disabled={!canImport || !upload.mappings.some(m => m.targetField)}
                      title={canImport ? undefined : hint('iam_admin')}
                      className="w-full py-2 text-xs font-medium text-white rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-info)' }}
                    >
                      {t('importRecords', { count: upload.rowCount })}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}

          <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
            <button onClick={() => setActiveTab('export')} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <span aria-hidden="true" className="rtl:inline-block rtl:-scale-x-100">←</span> {t('backToExport')}
            </button>
            {(uploads.users.status === 'done' || uploads.groups.status === 'done') && (
              <button
                onClick={() => setActiveTab('review')}
                className="px-6 py-2.5 text-sm font-medium text-white rounded-lg"
                style={{ backgroundColor: 'var(--color-info)' }}
              >
                {t('reviewResults')} <span aria-hidden="true" className="rtl:inline-block rtl:-scale-x-100">→</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Review */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {DATA_TYPES.map(dt => {
              const upload = uploads[dt.key]
              const label = t(`dataTypes.${dt.key}.label`)
              return (
                <div key={dt.key} className="rounded-lg border p-4 text-center" style={{ borderColor: upload.status === 'done' ? 'var(--color-success)' : 'var(--border-default)', backgroundColor: 'var(--bg-primary)' }}>
                  {upload.status === 'done' ? (
                    <>
                      <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{format.number(upload.importedCount)}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
                    </>
                  ) : (
                    <>
                      <FileText className="w-8 h-8 mx-auto mb-2 text-[var(--text-secondary)]" aria-hidden="true" />
                      <p className="text-sm font-medium text-[var(--text-secondary)]">{t('notImported')}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {allDone && (
            <div className="rounded-lg p-4 border-s-[3px]" style={{ backgroundColor: 'var(--color-success-bg)', borderColor: 'var(--color-success)' }} role="status">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{t('importComplete')}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {t('importCompleteDesc')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('whatNext')}</h3>
            <ul className="space-y-1.5">
              {[
                { done: uploads.users.status === 'done', key: 'inventory' },
                { done: uploads.groups.status === 'done', key: 'tiering' },
                { done: uploads.groups.status === 'done', key: 'tierViolations' },
                { done: uploads.users.status === 'done', key: 'riskScores' },
                { done: uploads.users.status === 'done', key: 'dormant' },
                { done: uploads.permissions.status === 'done', key: 'gpoRisks' },
                { done: uploads.permissions.status === 'done', key: 'shadowAdmins' },
              ].map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-xs">
                  {item.done ? (
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                  ) : (
                    <div className="w-4 h-4 shrink-0 mt-0.5 rounded-full border" style={{ borderColor: 'var(--border-default)' }} aria-hidden="true" />
                  )}
                  <span style={{ color: item.done ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{t(`nextSteps.${item.key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setActiveTab('import')} className="flex-1 py-2.5 text-sm font-medium rounded-lg text-[var(--text-primary)]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              {t('importMore')}
            </button>
            <Link href="/dashboard" className="flex-1 py-2.5 text-sm font-medium text-white rounded-lg text-center" style={{ backgroundColor: 'var(--color-info)' }}>
              {t('viewDashboard')} <span aria-hidden="true" className="rtl:inline-block rtl:-scale-x-100">→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
