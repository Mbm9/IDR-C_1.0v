'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, Building2, Plug, RefreshCw, Users,
  TreePine, Cloud, ShieldCheck, Compass, Upload,
  Check, ChevronRight, ChevronLeft, X, Plus, Loader2,
  FileSpreadsheet, Database, Copy,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { CSVMappingPreview } from '@/components/onboarding/csv-mapping-preview'

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrgData {
  name: string
  industry: string
  domain: string
  regulatoryFrameworks: string[]
  country: string
}

interface TeamMember {
  email: string
  role: string
}

interface InviteLink {
  email: string
  role: string
  inviteUrl?: string | null
  emailed?: boolean
}

interface SyncProgressItem {
  stage: string
  count: number
  done: boolean
}

interface CSVDetectionResult {
  mapping: Record<string, string>
  formatDetection: { dateFormat: string; csvType: string }
  confidence: Record<string, number>
  unmapped: string[]
}

// ─── Constants ───────────────────────────────────────────────────────────────
// Labels are message keys under onboarding.*
const STEPS = [
  { id: 1, label: 'organization', icon: Building2 },
  { id: 2, label: 'connectSource', icon: Plug },
  { id: 3, label: 'initialSync', icon: RefreshCw },
  { id: 4, label: 'inviteTeam', icon: Users },
] as const

// Stored values stay English (organization record); labels are translated.
const INDUSTRIES = [
  { value: 'Banking', key: 'banking' },
  { value: 'Energy', key: 'energy' },
  { value: 'Government', key: 'government' },
  { value: 'Healthcare', key: 'healthcare' },
  { value: 'Technology', key: 'technology' },
  { value: 'Telecom', key: 'telecom' },
  { value: 'Other', key: 'other' },
] as const

const FRAMEWORKS = [
  { value: 'NCA_ECC', label: 'NCA ECC' },
  { value: 'SAMA_CSF', label: 'SAMA CSF' },
  { value: 'PDPL', label: 'PDPL' },
  { value: 'ISO_27001', label: 'ISO 27001' },
  { value: 'NIST', label: 'NIST' },
]

const COUNTRIES = [
  { value: 'Saudi Arabia', key: 'saudiArabia' },
  { value: 'UAE', key: 'uae' },
  { value: 'Bahrain', key: 'bahrain' },
  { value: 'Kuwait', key: 'kuwait' },
  { value: 'Oman', key: 'oman' },
  { value: 'Qatar', key: 'qatar' },
  { value: 'Egypt', key: 'egypt' },
  { value: 'Jordan', key: 'jordan' },
  { value: 'Other', key: 'other' },
] as const

// Brand names stay in Latin script; descriptions are message keys under onboarding.sourceDescriptions.
const INTEGRATION_TYPES = [
  { type: 'active_directory', name: 'Active Directory', icon: TreePine },
  { type: 'azure_ad', name: 'Azure AD / Entra ID', icon: Cloud },
  { type: 'okta', name: 'Okta', icon: ShieldCheck },
  { type: 'sailpoint', name: 'SailPoint IdentityIQ', icon: Compass },
  { type: 'csv_import', name: null, icon: Upload },
] as const

// Labels are message keys under onboarding.fields.
const INTEGRATION_FIELDS: Record<string, { label: string; key: string; type: string; placeholder: string }[]> = {
  active_directory: [
    { label: 'ldapUrl', key: 'ldapUrl', type: 'text', placeholder: 'ldap://dc01.corp.local:389' },
    { label: 'baseDn', key: 'baseDn', type: 'text', placeholder: 'DC=corp,DC=local' },
    { label: 'bindDn', key: 'bindDn', type: 'text', placeholder: 'CN=svc-radar,OU=Service Accounts,DC=corp,DC=local' },
    { label: 'bindPassword', key: 'bindPassword', type: 'password', placeholder: '••••••••' },
  ],
  azure_ad: [
    { label: 'tenantId', key: 'tenantId', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { label: 'clientId', key: 'clientId', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { label: 'clientSecret', key: 'clientSecret', type: 'password', placeholder: '••••••••' },
  ],
  okta: [
    { label: 'oktaDomain', key: 'domain', type: 'text', placeholder: 'dev-123456.okta.com' },
    { label: 'apiToken', key: 'apiToken', type: 'password', placeholder: '••••••••' },
  ],
  sailpoint: [
    { label: 'tenantUrl', key: 'tenantUrl', type: 'text', placeholder: 'https://tenant.api.identitynow.com' },
    { label: 'clientId', key: 'clientId', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { label: 'clientSecret', key: 'clientSecret', type: 'password', placeholder: '••••••••' },
  ],
  csv_import: [],
}

const ROLES = ['viewer', 'analyst', 'iam_admin', 'ciso'] as const

// ─── CSV Helpers ─────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  values.push(current.trim())
  return values
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { data: session, status, update: updateSession } = useSession()
  const router = useRouter()
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const tAccess = useTranslations('access')

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Organization
  const [org, setOrg] = useState<OrgData>({
    name: '',
    industry: '',
    domain: '',
    regulatoryFrameworks: [],
    country: 'Saudi Arabia',
  })

  // Step 2: Integration
  const [selectedIntegrationType, setSelectedIntegrationType] = useState<string | null>(null)
  const [integrationConfig, setIntegrationConfig] = useState<Record<string, string>>({})
  const [integrationSaved, setIntegrationSaved] = useState(false)
  const [skippedIntegration, setSkippedIntegration] = useState(false)

  // Step 2: CSV Import state
  const [csvFileContent, setCsvFileContent] = useState<string | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvSampleRows, setCsvSampleRows] = useState<string[][]>([])
  const [csvDetection, setCsvDetection] = useState<CSVDetectionResult | null>(null)
  const [csvDetecting, setCsvDetecting] = useState(false)
  const [csvMappingConfirmed, setCsvMappingConfirmed] = useState(false)
  const [csvImportMode, setCsvImportMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 3: Sync
  const [syncProgress, setSyncProgress] = useState<SyncProgressItem[]>([])
  const [syncComplete, setSyncComplete] = useState(false)
  const [syncResults, setSyncResults] = useState({ identities: 0, violations: 0, risks: 0 })
  const [demoLoading, setDemoLoading] = useState(false)
  const [integrationId, setIntegrationId] = useState<string | null>(null)

  // Step 4: Team
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([{ email: '', role: 'viewer' }])
  const [inviteLinks, setInviteLinks] = useState<InviteLink[] | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  // Redirect if the user already had an org when they arrived. Step 1 refreshes the
  // session with the org it just created; that must not cut the wizard short.
  const createdOrgHere = useRef(false)
  useEffect(() => {
    if (session?.user?.orgId && !createdOrgHere.current) {
      router.push('/dashboard')
    }
  }, [session, router])

  // Auto-suggest domain from email
  useEffect(() => {
    if (session?.user?.email && !org.domain) {
      const emailDomain = session.user.email.split('@')[1]
      if (emailDomain) {
        setOrg(prev => ({ ...prev, domain: emailDomain }))
      }
    }
  }, [session?.user?.email, org.domain])

  // Unauthenticated visitors go to the login page (navigation belongs in an effect, not render)
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // ─── Step Handlers ─────────────────────────────────────────────────────────

  const handleOrgSubmit = async () => {
    if (!org.name || !org.domain) {
      setError(t('errors.orgRequired'))
      return
    }
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'organization', data: org }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('errors.orgFailed'))
        setLoading(false)
        return
      }

      // Refresh session to pick up new orgId
      createdOrgHere.current = true
      await updateSession()
      setStep(2)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  const handleIntegrationSubmit = async () => {
    if (!selectedIntegrationType) return
    setError('')
    setLoading(true)

    try {
      // Stored integration name: brand name (or "CSV Import"), kept in English
      const storedName = INTEGRATION_TYPES.find(i => i.type === selectedIntegrationType)?.name || 'CSV Import'
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'integration',
          data: {
            type: selectedIntegrationType,
            name: storedName,
            config: integrationConfig,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('errors.integrationFailed'))
        setLoading(false)
        return
      }

      const result = await res.json()
      if (result.integrationId) {
        setIntegrationId(result.integrationId)
      }
      setIntegrationSaved(true)
      setStep(3)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  // ─── CSV Import Handlers ────────────────────────────────────────────────

  const handleCsvFileDrop = async (file: File) => {
    setError('')
    const text = await file.text()
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) {
      setError(t('errors.csvTooShort'))
      return
    }

    const headers = parseCsvLine(lines[0])
    const sampleRows: string[][] = []
    for (let i = 1; i <= Math.min(3, lines.length - 1); i++) {
      sampleRows.push(parseCsvLine(lines[i]))
    }

    setCsvFileContent(text)
    setCsvHeaders(headers)
    setCsvSampleRows(sampleRows)
    setCsvDetecting(true)

    // Call AI detection
    try {
      const res = await fetch('/api/import/csv-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, sampleRows }),
      })

      if (res.ok) {
        const detection = await res.json()
        setCsvDetection(detection)
      } else {
        setError(t('errors.detectionFailed'))
        setCsvDetection({
          mapping: {},
          formatDetection: { dateFormat: 'iso8601', csvType: 'generic' },
          confidence: {},
          unmapped: headers,
        })
      }
    } catch {
      setError(t('errors.detectionFailed'))
      setCsvDetection({
        mapping: {},
        formatDetection: { dateFormat: 'iso8601', csvType: 'generic' },
        confidence: {},
        unmapped: headers,
      })
    } finally {
      setCsvDetecting(false)
    }
  }

  const handleCsvMappingConfirm = async (mapping: Record<string, string>) => {
    if (!csvFileContent) return
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent: csvFileContent,
          mapping,
          orgId: session?.user?.orgId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('errors.csvImportFailed'))
        setLoading(false)
        return
      }

      const result = await res.json()
      setCsvMappingConfirmed(true)
      setCsvImportMode(true)
      setSyncComplete(true)
      setSyncResults({
        identities: result.report?.identitiesUpserted || 0,
        violations: 0,
        risks: 0,
      })
      setStep(3)
    } catch {
      setError(t('errors.importFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleCsvReset = () => {
    setCsvFileContent(null)
    setCsvHeaders([])
    setCsvSampleRows([])
    setCsvDetection(null)
    setCsvDetecting(false)
  }

  // ─── Demo Data Handler ─────────────────────────────────────────────────

  const handleLoadDemoData = async () => {
    setError('')
    setDemoLoading(true)

    try {
      const res = await fetch('/api/import/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('errors.demoFailed'))
        setDemoLoading(false)
        return
      }

      const result = await res.json()
      setSyncComplete(true)
      setSyncResults({
        identities: result.summary?.identities || 50,
        violations: result.summary?.violations || 10,
        risks: 0,
      })
    } catch {
      setError(t('errors.demoFailed'))
    } finally {
      setDemoLoading(false)
    }
  }

  // ─── Real Sync via SSE ──────────────────────────────────────────────────

  const startRealSync = useCallback((intId: string) => {
    const eventSource = new EventSource(`/api/sync/stream?integrationId=${intId}`)

    const progressMap = new Map<string, SyncProgressItem>()

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.phase === 'complete') {
          eventSource.close()
          setSyncComplete(true)
          setSyncResults({
            identities: data.summary?.identitiesUpserted || 0,
            violations: data.summary?.entitlementsUpserted || 0,
            risks: (data.summary?.errors?.length || 0),
          })
          return
        }

        if (data.phase === 'error') {
          eventSource.close()
          setError(data.error || t('errors.syncFailed'))
          return
        }

        // Update progress
        const existing = progressMap.get(data.phase)
        const item: SyncProgressItem = {
          stage: data.message || data.phase,
          count: data.progress || 0,
          done: false,
        }
        progressMap.set(data.phase, item)

        // Convert to array for display
        const items = Array.from(progressMap.values())
        // Mark all but last as done
        for (let i = 0; i < items.length - 1; i++) {
          items[i].done = true
        }
        setSyncProgress([...items])
      } catch {
        // ignore parse errors
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      // If not already complete, mark as done
      setSyncComplete(prev => {
        if (!prev) {
          setError(t('errors.streamLost'))
        }
        return prev
      })
    }

    return () => {
      eventSource.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (step === 3 && integrationId && !csvImportMode && !skippedIntegration) {
      const cleanup = startRealSync(integrationId)
      return cleanup
    }
  }, [step, integrationId, csvImportMode, skippedIntegration, startRealSync])

  const handleTeamInvite = async () => {
    const validMembers = teamMembers.filter(m => m.email.trim())
    if (validMembers.length === 0) {
      // Skip, no invites
      router.push('/dashboard')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'team', data: { members: validMembers } }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('errors.inviteFailed'))
        setLoading(false)
        return
      }

      // Invite links are single-use and shown only once — show them before leaving the wizard.
      const body = await res.json().catch(() => ({}))
      const invites: InviteLink[] = Array.isArray(body.invites) ? body.invites : []
      if (invites.length > 0) {
        setInviteLinks(invites)
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError(t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  const addTeamMember = () => {
    setTeamMembers(prev => [...prev, { email: '', role: 'viewer' }])
  }

  const removeTeamMember = (index: number) => {
    setTeamMembers(prev => prev.filter((_, i) => i !== index))
  }

  const updateTeamMember = (index: number, field: 'email' | 'role', value: string) => {
    setTeamMembers(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }

  const toggleFramework = (fw: string) => {
    setOrg(prev => ({
      ...prev,
      regulatoryFrameworks: prev.regulatoryFrameworks.includes(fw)
        ? prev.regulatoryFrameworks.filter(f => f !== fw)
        : [...prev.regulatoryFrameworks, fw],
    }))
  }

  // Early returns come after every hook so the hook order is stable between renders.
  if (status === 'loading' || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <div className="text-[var(--text-secondary)] animate-pulse" role="status">{tCommon('loading')}</div>
      </main>
    )
  }

  const typeName = (type: string | null) => {
    const found = INTEGRATION_TYPES.find(i => i.type === type)
    return found ? (found.name ?? t('csvImport')) : (type ?? '')
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[var(--bg-secondary)] flex flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-info)] flex items-center justify-center">
              <Shield size={16} className="text-white" aria-hidden="true" />
            </div>
            <span className="text-body font-semibold text-[var(--text-primary)]">{t('productName')}</span>
          </div>
          <span className="text-caption text-[var(--text-secondary)]">{t('setupWizard')}</span>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <ol className="flex items-center justify-between" aria-label={t('progress', { current: step, total: STEPS.length })}>
            {STEPS.map((s, idx) => {
              const StepIcon = s.icon
              const isActive = step === s.id
              const isDone = step > s.id
              return (
                <li key={s.id} className="flex items-center flex-1" aria-current={isActive ? 'step' : undefined}>
                  <div className="flex items-center gap-2">
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-caption font-medium transition-colors ${
                      isDone ? 'bg-[var(--color-low)] text-white' :
                      isActive ? 'bg-[var(--color-info)] text-white' :
                      'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                    }`} aria-hidden="true">
                      {isDone ? <Check size={14} /> : <StepIcon size={14} />}
                    </div>
                    <span className={`text-caption font-medium sr-only sm:not-sr-only ${
                      isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}>
                      {t(`steps.${s.label}`)}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-3 ${
                      step > s.id ? 'bg-[var(--color-low)]' : 'bg-[var(--border-default)]'
                    }`} aria-hidden="true" />
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-2xl">
          {error && (
            <div role="alert" className="mb-6 px-4 py-3 rounded-[var(--radius-card)] text-caption font-medium flex items-center justify-between border text-[var(--text-primary)]" style={{ backgroundColor: 'var(--color-critical-bg)', borderColor: 'var(--color-critical)' }}>
              <bdi>{error}</bdi>
              <button onClick={() => setError('')} className="ms-2" aria-label={t('dismissError')} title={t('dismissError')}><X size={14} aria-hidden="true" /></button>
            </div>
          )}

          {/* Step 1: Organization Setup */}
          {step === 1 && (
            <div className="animate-fade-in">
              <h1 className="text-title text-[var(--text-primary)] mb-1">{t('org.title')}</h1>
              <p className="text-body text-[var(--text-secondary)] mb-8">
                {t('org.description')}
              </p>

              <div className="space-y-5">
                <div>
                  <label htmlFor="org-name" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                    {t('org.name')} <span className="text-[var(--color-critical-text)]" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="org-name"
                    required
                    aria-required="true"
                    type="text"
                    value={org.name}
                    onChange={(e) => setOrg({ ...org, name: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-secondary)]"
                    placeholder="ACME Financial Services"
                  />
                </div>

                <div>
                  <label htmlFor="org-industry" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                    {t('org.industry')}
                  </label>
                  <select
                    id="org-industry"
                    value={org.industry}
                    onChange={(e) => setOrg({ ...org, industry: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent"
                  >
                    <option value="">{t('org.selectIndustry')}</option>
                    {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{t(`industries.${i.key}`)}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="org-domain" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                    {t('org.domain')} <span className="text-[var(--color-critical-text)]" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="org-domain"
                    required
                    aria-required="true"
                    dir="ltr"
                    type="text"
                    value={org.domain}
                    onChange={(e) => setOrg({ ...org, domain: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-secondary)]"
                    placeholder="acmefs.sa"
                  />
                </div>

                <div role="group" aria-labelledby="org-frameworks-label">
                  <p id="org-frameworks-label" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                    {t('org.frameworks')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {FRAMEWORKS.map(fw => (
                      <button
                        key={fw.value}
                        type="button"
                        onClick={() => toggleFramework(fw.value)}
                        aria-pressed={org.regulatoryFrameworks.includes(fw.value)}
                        dir="ltr"
                        className={`px-3 py-1.5 rounded-[var(--radius-badge)] text-caption font-medium border transition-colors ${
                          org.regulatoryFrameworks.includes(fw.value)
                            ? 'bg-[var(--color-info)] text-white border-[var(--color-info)]'
                            : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--border-hover)]'
                        }`}
                      >
                        {fw.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="org-country" className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                    {t('org.country')}
                  </label>
                  <select
                    id="org-country"
                    value={org.country}
                    onChange={(e) => setOrg({ ...org, country: e.target.value })}
                    className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent"
                  >
                    {COUNTRIES.map(c => <option key={c.value} value={c.value}>{t(`countries.${c.key}`)}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={handleOrgSubmit}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                  {t('continue')}
                  <ChevronRight size={16} className="rtl:-scale-x-100" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect First Source */}
          {step === 2 && (
            <div className="animate-fade-in">
              <h1 className="text-title text-[var(--text-primary)] mb-1">{t('source.title')}</h1>
              <p className="text-body text-[var(--text-secondary)] mb-8">
                {t('source.description')}
              </p>

              {!selectedIntegrationType ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {INTEGRATION_TYPES.map(int => {
                    const IntIcon = int.icon
                    return (
                      <button
                        key={int.type}
                        onClick={() => {
                          setSelectedIntegrationType(int.type)
                          setIntegrationConfig({})
                          handleCsvReset()
                        }}
                        className="p-5 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] text-start hover:border-[var(--color-info)] hover:shadow-md transition-all group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-[var(--color-info-bg)] flex items-center justify-center mb-3 group-hover:bg-[var(--color-info)]/20 transition-colors">
                          <IntIcon size={20} className="text-[var(--color-info-text)]" aria-hidden="true" />
                        </div>
                        <h2 className="text-body font-semibold text-[var(--text-primary)]"><bdi>{typeName(int.type)}</bdi></h2>
                        <p className="text-caption text-[var(--text-secondary)] mt-1">{t(`sourceDescriptions.${int.type}`)}</p>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const IntType = INTEGRATION_TYPES.find(t => t.type === selectedIntegrationType)
                        const IntIcon = IntType?.icon || Plug
                        return (
                          <>
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-info-bg)] flex items-center justify-center">
                              <IntIcon size={16} className="text-[var(--color-info-text)]" aria-hidden="true" />
                            </div>
                            <h2 className="text-body font-semibold text-[var(--text-primary)]"><bdi>{typeName(IntType?.type ?? selectedIntegrationType)}</bdi></h2>
                          </>
                        )
                      })()}
                    </div>
                    <button
                      onClick={() => { setSelectedIntegrationType(null); setIntegrationConfig({}); handleCsvReset() }}
                      className="text-caption text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {t('source.change')}
                    </button>
                  </div>

                  {selectedIntegrationType === 'csv_import' ? (
                    <div>
                      {!csvFileContent ? (
                        /* Drag & Drop Zone */
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={t('source.dropCsv')}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
                          className="py-10 border-2 border-dashed border-[var(--border-default)] rounded-[var(--radius-card)] hover:border-[var(--color-info)] transition-colors cursor-pointer"
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const file = e.dataTransfer.files[0]
                            if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
                              handleCsvFileDrop(file)
                            } else {
                              setError(t('errors.notCsv'))
                            }
                          }}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            tabIndex={-1}
                            aria-hidden="true"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleCsvFileDrop(file)
                            }}
                          />
                          <div className="text-center">
                            <Upload size={32} className="mx-auto text-[var(--text-secondary)] mb-3" aria-hidden="true" />
                            <p className="text-body text-[var(--text-secondary)]">
                              {t('source.dropCsv')}
                            </p>
                            <p className="text-caption text-[var(--text-secondary)] mt-1">
                              {t('source.csvSupports')}
                            </p>
                          </div>
                        </div>
                      ) : csvDetecting ? (
                        /* Detection in progress */
                        <div className="py-10 text-center">
                          <Loader2 size={32} className="mx-auto text-[var(--color-info-text)] animate-spin mb-3" aria-hidden="true" />
                          <p className="text-body text-[var(--text-primary)] font-medium" role="status">
                            {t('source.detecting')}
                          </p>
                          <p className="text-caption text-[var(--text-secondary)] mt-1">
                            {t('source.detectingHint')}
                          </p>
                        </div>
                      ) : csvDetection ? (
                        /* Show mapping preview */
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <FileSpreadsheet size={16} className="text-[var(--color-info-text)]" aria-hidden="true" />
                            <span className="text-body font-medium text-[var(--text-primary)]">
                              {t('source.mappingDetected')}
                            </span>
                          </div>
                          <CSVMappingPreview
                            headers={csvHeaders}
                            sampleRows={csvSampleRows}
                            mapping={csvDetection.mapping}
                            confidence={csvDetection.confidence}
                            formatDetection={csvDetection.formatDetection}
                            unmapped={csvDetection.unmapped}
                            onConfirm={handleCsvMappingConfirm}
                            onReset={handleCsvReset}
                            loading={loading}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(INTEGRATION_FIELDS[selectedIntegrationType] || []).map(field => (
                        <div key={field.key}>
                          <label htmlFor={`onb-${field.key}`} className="block text-caption font-medium text-[var(--text-primary)] mb-1.5">
                            {t(`fields.${field.label}`)}
                          </label>
                          <input
                            id={`onb-${field.key}`}
                            dir="ltr"
                            autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                            type={field.type}
                            value={integrationConfig[field.key] || ''}
                            onChange={(e) => setIntegrationConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-secondary)] font-[var(--font-mono)]"
                            placeholder={field.placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedIntegrationType !== 'csv_import' && (
                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={handleIntegrationSubmit}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                        {t('source.saveContinue')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 text-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ChevronLeft size={16} className="rtl:-scale-x-100" aria-hidden="true" /> {tCommon('back')}
                </button>
                <button
                  onClick={() => {
                    setSkippedIntegration(true)
                    setStep(3)
                  }}
                  className="text-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {t('skipForNow')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Initial Sync */}
          {step === 3 && (
            <div className="animate-fade-in">
              <h1 className="text-title text-[var(--text-primary)] mb-1">
                {skippedIntegration ? t('sync.quickTitle') : csvImportMode ? t('sync.importTitle') : t('sync.title')}
              </h1>
              <p className="text-body text-[var(--text-secondary)] mb-8">
                {skippedIntegration
                  ? t('sync.quickDescription')
                  : csvImportMode
                    ? t('sync.importDescription')
                    : t('sync.description')
                }
              </p>

              {skippedIntegration ? (
                <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-8">
                  <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-12 h-12 rounded-full bg-[var(--color-info-bg)] flex items-center justify-center mx-auto mb-4">
                      <Database size={24} className="text-[var(--color-info-text)]" aria-hidden="true" />
                    </div>
                    {syncComplete ? (
                      <div role="status">
                        <p className="text-body text-[var(--text-primary)] font-semibold mb-2">{t('sync.demoLoaded')}</p>
                        <p className="text-body text-[var(--text-secondary)]">
                          {t.rich('sync.demoSummary', {
                            identities: syncResults.identities,
                            violations: syncResults.violations,
                            strong: (chunks) => <strong className="text-[var(--text-primary)]">{chunks}</strong>,
                          })}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-body text-[var(--text-primary)] font-medium mb-2">{t('sync.tryDemo')}</p>
                        <p className="text-caption text-[var(--text-secondary)] mb-4">
                          {t('sync.tryDemoDescription')}
                        </p>
                        <button
                          onClick={handleLoadDemoData}
                          disabled={demoLoading}
                          className="inline-flex items-center gap-2 px-5 py-2 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {demoLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Database size={16} aria-hidden="true" />}
                          {t('sync.tryDemoButton')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : csvImportMode && syncComplete ? (
                <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-6" role="status">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-[var(--color-low)] flex items-center justify-center" aria-hidden="true">
                      <Check size={12} className="text-white" />
                    </div>
                    <span className="text-body font-semibold text-[var(--text-primary)]">{t('sync.importDone')}</span>
                  </div>
                  <p className="text-body text-[var(--text-secondary)]">
                    {t.rich('sync.importSummary', {
                      identities: syncResults.identities,
                      strong: (chunks) => <strong className="text-[var(--text-primary)]">{chunks}</strong>,
                    })}
                  </p>
                </div>
              ) : (
                <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-6 space-y-4">
                  {syncProgress.map((sp, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      {sp.done ? (
                        <div className="w-6 h-6 rounded-full bg-[var(--color-low)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                          <Check size={12} className="text-white" />
                        </div>
                      ) : (
                        <Loader2 size={20} className="text-[var(--color-info-text)] animate-spin flex-shrink-0" aria-hidden="true" />
                      )}
                      <div className="flex-1">
                        <span className="text-body text-[var(--text-primary)]" dir="auto">{sp.stage}</span>
                        {sp.count > 0 && (
                          <span className="ms-2 text-caption text-[var(--text-secondary)]">{sp.count}</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {syncProgress.length === 0 && !syncComplete && (
                    <div className="flex items-center gap-3">
                      <Loader2 size={20} className="text-[var(--color-info-text)] animate-spin" aria-hidden="true" />
                      <span className="text-body text-[var(--text-primary)]" role="status">{t('sync.connecting')}</span>
                    </div>
                  )}

                  {syncComplete && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="shrink-0 w-6 h-6 rounded-full bg-[var(--color-low)] flex items-center justify-center" aria-hidden="true">
                          <Check size={12} className="text-white" />
                        </div>
                        <span className="text-body font-semibold text-[var(--text-primary)]" role="status">{t('sync.syncDone')}</span>
                      </div>
                      <p className="text-body text-[var(--text-secondary)]">
                        {t.rich('sync.syncSummary', {
                          identities: syncResults.identities,
                          entitlements: syncResults.violations,
                          errors: syncResults.risks,
                          strong: (chunks) => <strong className="text-[var(--text-primary)]">{chunks}</strong>,
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1 text-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ChevronLeft size={16} className="rtl:-scale-x-100" aria-hidden="true" /> {tCommon('back')}
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={!syncComplete && !skippedIntegration}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {t('continue')} <ChevronRight size={16} className="rtl:-scale-x-100" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Invite Team */}
          {step === 4 && (
            <div className="animate-fade-in">
              <h1 className="text-title text-[var(--text-primary)] mb-1">{t('team.title')}</h1>
              <p className="text-body text-[var(--text-secondary)] mb-8">
                {t('team.description')}
              </p>

              {inviteLinks ? (
                <div className="space-y-4" role="status">
                  <div className="rounded-[var(--radius-card)] border bg-[var(--bg-primary)] p-4" style={{ borderColor: 'var(--color-low)' }}>
                    <p className="text-body font-semibold text-[var(--text-primary)]">{t('team.invitesCreated', { count: inviteLinks.length })}</p>
                    <p className="text-caption text-[var(--text-secondary)] mt-1">{t('team.linksOnce')}</p>
                  </div>
                  <ul className="space-y-3">
                    {inviteLinks.map((inv, idx) => (
                      <li key={`${inv.email}-${idx}`} className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-3">
                        <p className="text-body text-[var(--text-primary)]">
                          <bdi>{inv.email}</bdi>
                          <span className="ms-2 text-caption text-[var(--text-secondary)]">{(ROLES as readonly string[]).includes(inv.role) ? tAccess(`roles.${inv.role as typeof ROLES[number]}`) : inv.role}</span>
                        </p>
                        <p className="text-caption text-[var(--text-secondary)] mt-1">
                          {inv.emailed ? t('team.emailed', { email: inv.email }) : t('team.shareLink')}
                        </p>
                        {inv.inviteUrl && (
                          <div className="mt-2 flex items-center gap-2">
                            <label htmlFor={`invite-link-${idx}`} className="sr-only">{t('team.linkFor', { email: inv.email })}</label>
                            <input id={`invite-link-${idx}`} readOnly dir="ltr" value={inv.inviteUrl} onFocus={(e) => e.currentTarget.select()}
                              className="flex-1 min-w-0 px-2 py-1.5 text-caption font-mono rounded border border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-primary)]" />
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(inv.inviteUrl!).then(() => setCopiedLink(inv.inviteUrl!)).catch(() => {}) }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-caption rounded border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                            >
                              <Copy size={14} aria-hidden="true" />
                              <span aria-live="polite">{copiedLink === inv.inviteUrl ? t('team.copied') : t('team.copyLink')}</span>
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-end">
                    <button
                      onClick={() => router.push('/dashboard')}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90"
                    >
                      {t('team.goToDashboard')} <ChevronRight size={16} className="rtl:-scale-x-100" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
              <>
              <div className="space-y-3">
                {teamMembers.map((member, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex-1">
                      <label htmlFor={`member-email-${idx}`} className="sr-only">{t('team.emailLabel', { number: idx + 1 })}</label>
                      <input
                        id={`member-email-${idx}`}
                        type="email"
                        dir="ltr"
                        value={member.email}
                        onChange={(e) => updateTeamMember(idx, 'email', e.target.value)}
                        className="w-full px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent placeholder:text-[var(--text-secondary)]"
                        placeholder="colleague@company.sa"
                      />
                    </div>
                    <label htmlFor={`member-role-${idx}`} className="sr-only">{t('team.roleLabel', { number: idx + 1 })}</label>
                    <select
                      id={`member-role-${idx}`}
                      value={member.role}
                      onChange={(e) => updateTeamMember(idx, 'role', e.target.value)}
                      className="px-3 py-2.5 border border-[var(--border-default)] rounded-[var(--radius-input)] text-body bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:border-transparent"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{tAccess(`roles.${r}`)}</option>)}
                    </select>
                    {teamMembers.length > 1 && (
                      <button
                        onClick={() => removeTeamMember(idx)}
                        aria-label={t('team.removeMember', { number: idx + 1 })}
                        title={t('team.removeMember', { number: idx + 1 })}
                        className="p-2.5 text-[var(--text-secondary)] hover:text-[var(--color-critical-text)] transition-colors"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addTeamMember}
                className="mt-3 inline-flex items-center gap-1.5 text-caption font-medium text-[var(--text-primary)] underline hover:opacity-80 transition-opacity"
              >
                <Plus size={14} aria-hidden="true" /> {t('team.addMember')}
              </button>

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-1 text-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ChevronLeft size={16} className="rtl:-scale-x-100" aria-hidden="true" /> {tCommon('back')}
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="text-body text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {t('skipForNow')}
                  </button>
                  <button
                    onClick={handleTeamInvite}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-[var(--color-info)] text-white rounded-[var(--radius-button)] text-body font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                    {t('team.complete')}
                  </button>
                </div>
              </div>
              </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
