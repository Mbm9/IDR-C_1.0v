'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, Check } from 'lucide-react'
import { integrationBrandName } from '@/lib/connectors/brand-names'

export interface ExistingIntegration {
  id: string
  name: string
  type: string
}

interface IntegrationWizardProps {
  isOpen: boolean
  onClose: () => void
  /** Called after a save; receives the saved integration. */
  onCreated: (integration?: { id: string; type: string }) => void
  /** When set, the wizard edits / reconnects this integration instead of creating one. */
  existing?: ExistingIntegration | null
}

type IntegrationType = 'active_directory' | 'azure_ad' | 'okta' | 'csv' | 'sailpoint_iiq' | 'broadcom_sso' | 'broadcom_pam' | 'servicenow' | 'microsoft_defender' | 'sap_grc' | 'hashicorp_vault' | 'splunk' | 'beyondtrust' | 'digicert'

interface TypeOption {
  type: IntegrationType
  icon: React.ReactNode
}

const INTEGRATION_TYPES: TypeOption[] = [
  {
    type: 'active_directory',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    type: 'azure_ad',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
      </svg>
    ),
  },
  {
    type: 'okta',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    type: 'sailpoint_iiq',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    type: 'broadcom_sso',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    type: 'broadcom_pam',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    type: 'servicenow',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
      </svg>
    ),
  },
  {
    type: 'csv',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    type: 'microsoft_defender',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    type: 'sap_grc',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    type: 'hashicorp_vault',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
      </svg>
    ),
  },
  {
    type: 'splunk',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
  },
  {
    type: 'beyondtrust',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
  {
    type: 'digicert',
    icon: (
      <svg aria-hidden="true" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
]

type Step = 'choose' | 'configure' | 'test' | 'confirm'
const STEPS: Step[] = ['choose', 'configure', 'test', 'confirm']

type FieldSpec =
  | { kind: 'input'; field: string; label: string; product?: string; placeholder?: string; placeholderKey?: string; secret?: boolean }
  | { kind: 'checkbox'; field: string; label: string }
  | { kind: 'section'; title: string; fields: FieldSpec[] }
  | { kind: 'hint'; key: string }

const GUID = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

/** Connection fields per integration type. Labels are message keys under integrations.wizard.fields. */
const FIELD_SPECS: Partial<Record<IntegrationType, FieldSpec[]>> = {
  active_directory: [
    { kind: 'input', field: 'host', label: 'ldapHost', placeholder: 'ldap.example.com' },
    { kind: 'input', field: 'port', label: 'port', placeholder: '389' },
    { kind: 'input', field: 'baseDN', label: 'baseDn', placeholder: 'DC=example,DC=com' },
    { kind: 'input', field: 'bindDN', label: 'bindDn', placeholder: 'CN=admin,DC=example,DC=com' },
    { kind: 'input', field: 'bindPassword', label: 'bindPassword', secret: true },
    { kind: 'checkbox', field: 'useTLS', label: 'useTls' },
  ],
  azure_ad: [
    { kind: 'input', field: 'tenantId', label: 'tenantId', placeholder: GUID },
    { kind: 'input', field: 'clientId', label: 'clientId', placeholder: GUID },
    { kind: 'input', field: 'clientSecret', label: 'clientSecret', secret: true },
  ],
  okta: [
    { kind: 'input', field: 'domain', label: 'oktaDomain', placeholder: 'example.okta.com' },
    { kind: 'input', field: 'apiToken', label: 'apiToken', secret: true },
  ],
  sailpoint_iiq: [
    { kind: 'input', field: 'baseUrl', label: 'baseUrl', product: 'IdentityIQ', placeholder: 'https://sailpoint-iiq.example.com/identityiq' },
    { kind: 'input', field: 'username', label: 'adminUsername', placeholder: 'spadmin' },
    { kind: 'input', field: 'password', label: 'adminPassword', secret: true },
    { kind: 'checkbox', field: 'useSCIM', label: 'useScim' },
    { kind: 'hint', key: 'sailpoint_iiq' },
  ],
  broadcom_sso: [
    { kind: 'input', field: 'baseUrl', label: 'baseUrl', product: 'SiteMinder', placeholder: 'https://siteminder.example.com:8443' },
    { kind: 'input', field: 'adminUser', label: 'adminUsername', placeholder: 'siteminder-admin' },
    { kind: 'input', field: 'adminPassword', label: 'adminPassword', secret: true },
    { kind: 'input', field: 'userDirectory', label: 'userDirectory', placeholder: 'LDAPUserDirectory' },
    { kind: 'input', field: 'policyDomain', label: 'policyDomainOptional', placeholderKey: 'allDomains' },
    { kind: 'hint', key: 'broadcom_sso' },
  ],
  broadcom_pam: [
    { kind: 'input', field: 'baseUrl', label: 'baseUrl', product: 'PAM', placeholder: 'https://pam.example.com:18443' },
    { kind: 'input', field: 'apiUser', label: 'apiUsername', placeholder: 'pam-api-admin' },
    { kind: 'input', field: 'apiPassword', label: 'apiPassword', secret: true },
    { kind: 'input', field: 'apiKey', label: 'apiKeyOptional', placeholderKey: 'optionalApiKey' },
    { kind: 'input', field: 'vaultName', label: 'vaultNameOptional', placeholderKey: 'allVaults' },
    { kind: 'hint', key: 'broadcom_pam' },
  ],
  servicenow: [
    { kind: 'input', field: 'instanceUrl', label: 'instanceUrl', placeholder: 'https://your-company.service-now.com' },
    { kind: 'input', field: 'username', label: 'username', placeholder: 'integration_user' },
    { kind: 'input', field: 'password', label: 'password', secret: true },
    {
      kind: 'section', title: 'oauthOptional', fields: [
        { kind: 'input', field: 'clientId', label: 'clientIdOptional', placeholderKey: 'oauthClientId' },
        { kind: 'input', field: 'clientSecret', label: 'clientSecretOptional', secret: true },
      ],
    },
    { kind: 'hint', key: 'servicenow' },
  ],
  microsoft_defender: [
    { kind: 'input', field: 'tenantId', label: 'tenantId', placeholder: GUID },
    { kind: 'input', field: 'clientId', label: 'clientId', placeholder: GUID },
    { kind: 'input', field: 'clientSecret', label: 'clientSecret', secret: true },
    { kind: 'hint', key: 'microsoft_defender' },
  ],
  sap_grc: [
    { kind: 'input', field: 'baseUrl', label: 'baseUrl', product: 'SAP GRC', placeholder: 'https://sap-grc.example.com:8443/sap/bc' },
    { kind: 'input', field: 'username', label: 'username', placeholder: 'GRC_API_USER' },
    { kind: 'input', field: 'password', label: 'password', secret: true },
    {
      kind: 'section', title: 'sapIdmOptional', fields: [
        { kind: 'input', field: 'clientId', label: 'clientIdOptional', placeholderKey: 'oauthClientId' },
        { kind: 'input', field: 'clientSecret', label: 'clientSecretOptional', secret: true },
        { kind: 'input', field: 'idmEndpoint', label: 'idmEndpointOptional', placeholder: 'https://sap-idm.example.com/idmrest' },
      ],
    },
    { kind: 'hint', key: 'sap_grc' },
  ],
  hashicorp_vault: [
    { kind: 'input', field: 'vaultAddr', label: 'vaultAddress', placeholder: 'https://vault.example.com:8200' },
    { kind: 'input', field: 'vaultToken', label: 'vaultTokenOptional', secret: true },
    {
      kind: 'section', title: 'appRoleOptional', fields: [
        { kind: 'input', field: 'roleId', label: 'roleId', placeholderKey: 'appRoleRoleId' },
        { kind: 'input', field: 'secretId', label: 'secretId', secret: true },
      ],
    },
    { kind: 'hint', key: 'hashicorp_vault' },
  ],
  splunk: [
    { kind: 'input', field: 'baseUrl', label: 'baseUrl', product: 'Splunk', placeholder: 'https://splunk.example.com:8089' },
    {
      kind: 'section', title: 'authChooseOne', fields: [
        { kind: 'input', field: 'username', label: 'usernameOptional', placeholder: 'splunk_admin' },
        { kind: 'input', field: 'password', label: 'passwordOptional', secret: true },
        { kind: 'input', field: 'bearerToken', label: 'bearerTokenOptional', secret: true },
      ],
    },
    { kind: 'hint', key: 'splunk' },
  ],
  beyondtrust: [
    { kind: 'input', field: 'hostUrl', label: 'hostUrl', placeholder: 'https://beyondtrust.example.com' },
    { kind: 'input', field: 'apiKey', label: 'apiKey', secret: true },
    { kind: 'input', field: 'runAsUser', label: 'runAsUser', placeholder: 'api_service_account' },
    { kind: 'hint', key: 'beyondtrust' },
  ],
  digicert: [
    { kind: 'input', field: 'apiKey', label: 'apiKey', secret: true },
    { kind: 'hint', key: 'digicert' },
  ],
}

function typeLabel(type: string, csvLabel: string) {
  return type === 'csv' ? csvLabel : integrationBrandName(type)
}

export function IntegrationWizard({ isOpen, onClose, onCreated, existing }: IntegrationWizardProps) {
  const t = useTranslations('integrations.wizard')
  const tCommon = useTranslations('common')
  const [step, setStep] = useState<Step>('choose')
  const [selectedType, setSelectedType] = useState<IntegrationType | null>(null)
  const [name, setName] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Editing / reconnecting an existing source starts at the configure step.
  useEffect(() => {
    if (!isOpen) return
    if (existing) {
      setSelectedType(existing.type as IntegrationType)
      setName(existing.name)
      setCredentials({})
      setTestResult(null)
      setError(null)
      setStep('configure')
    }
  }, [isOpen, existing])

  // Escape closes; focus moves into the dialog when it opens.
  useEffect(() => {
    if (!isOpen) return
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  function reset() {
    setStep('choose')
    setSelectedType(null)
    setName('')
    setCredentials({})
    setTestResult(null)
    setTesting(false)
    setSaving(false)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSelectType(type: IntegrationType) {
    setSelectedType(type)
    setName(typeLabel(type, t('types.csv')))
    setCredentials({})
    setTestResult(null)
    setStep('configure')
  }

  function handleFieldChange(field: string, value: string) {
    setCredentials(prev => ({ ...prev, [field]: value }))
  }

  async function handleTestConnection() {
    if (!selectedType) return
    setTesting(true)
    setTestResult(null)
    setError(null)

    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, credentials }),
      })
      const data = await res.json()
      setTestResult({ ok: !!data.ok, message: data.message || '' })
      if (data.ok) {
        setStep('confirm')
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || t('testFailed') })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!selectedType) return
    setSaving(true)
    setError(null)

    try {
      const res = existing
        ? await fetch(`/api/integrations/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, config: credentials }),
        })
        : await fetch('/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            type: selectedType,
            config: credentials,
            syncFrequencyMinutes: 360,
          }),
        })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('saveFailed'))

      onCreated(data.integration ? { id: data.integration.id, type: data.integration.type ?? selectedType } : undefined)
      handleClose()
    } catch (err: any) {
      setError(err.message || t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const stepIndex = STEPS.indexOf(step)
  const selectedLabel = selectedType ? typeLabel(selectedType, t('types.csv')) : ''

  function renderField(spec: FieldSpec, i: number): React.ReactNode {
    switch (spec.kind) {
      case 'input':
        return (
          <FormField
            key={spec.field}
            label={spec.product ? t(`fields.${spec.label}`, { product: spec.product }) : t(`fields.${spec.label}`)}
            field={spec.field}
            value={credentials[spec.field]}
            onChange={handleFieldChange}
            placeholder={spec.placeholderKey ? t(`placeholders.${spec.placeholderKey}`) : spec.placeholder}
            type={spec.secret ? 'password' : 'text'}
          />
        )
      case 'checkbox':
        return (
          <div key={spec.field} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`wiz-${spec.field}`}
              checked={credentials[spec.field] === 'true'}
              onChange={(e) => handleFieldChange(spec.field, String(e.target.checked))}
              className="rounded border-[var(--border-default)] w-4 h-4"
            />
            <label htmlFor={`wiz-${spec.field}`} className="text-xs text-[var(--text-secondary)]">{t(`fields.${spec.label}`)}</label>
          </div>
        )
      case 'section':
        return (
          <fieldset key={`section-${i}`} className="border-t border-[var(--border-default)] pt-3 mt-3">
            <legend className="text-xs font-medium text-[var(--text-secondary)] mb-2">{t(`sections.${spec.title}`)}</legend>
            <div className="space-y-3">{spec.fields.map(renderField)}</div>
          </fieldset>
        )
      case 'hint':
        return <p key={`hint-${i}`} className="text-[11px] text-[var(--text-secondary)]">{t(`hints.${spec.key}`)}</p>
    }
  }

  const stepSubtitle = {
    choose: t('steps.choose'),
    configure: existing ? t('steps.reconnect', { name: existing.name }) : t('steps.configure', { type: selectedLabel }),
    test: t('steps.test'),
    confirm: t('steps.confirm'),
  }[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-default)]">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-[var(--text-primary)]">
              {existing ? t('reconnectTitle') : t('title')}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]"><bdi>{stepSubtitle}</bdi></p>
          </div>
          <button
            onClick={handleClose}
            aria-label={t('close')}
            title={t('close')}
            className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Steps indicator */}
        <ol className="flex items-center gap-1 px-4 pt-4" aria-label={t('progress', { current: stepIndex + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1" aria-current={step === s ? 'step' : undefined}>
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s
                  ? 'bg-[var(--color-accent)] text-white'
                  : stepIndex > i
                    ? 'bg-[var(--color-low)] text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
              }`}>
                {stepIndex > i ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : i + 1}
                <span className="sr-only">{t(`stepNames.${s}`)}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${stepIndex > i ? 'bg-[var(--color-low)]' : 'bg-[var(--bg-secondary)]'}`} aria-hidden="true" />}
            </li>
          ))}
        </ol>

        {/* Content */}
        <div className="p-4">
          {/* Step 1: Choose Type */}
          {step === 'choose' && (
            <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
              {INTEGRATION_TYPES.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => handleSelectType(opt.type)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--border-default)] hover:border-[var(--color-accent)] hover:bg-[var(--bg-secondary)] transition-colors text-center"
                >
                  <span className="text-[var(--text-secondary)]">{opt.icon}</span>
                  <span className="text-xs font-semibold text-[var(--text-primary)]"><bdi>{typeLabel(opt.type, t('types.csv'))}</bdi></span>
                  <span className="text-[11px] text-[var(--text-secondary)] leading-tight">{t(`descriptions.${opt.type}`)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 'configure' && selectedType && (
            <div className="space-y-3">
              {existing && (
                <p className="text-xs text-[var(--text-secondary)] rounded-lg bg-[var(--bg-secondary)] p-3">{t('reconnectNote')}</p>
              )}
              <FormField label={t('fields.name')} field="__name" value={name} onChange={(_, v) => setName(v)} />

              {(FIELD_SPECS[selectedType] ?? []).map(renderField)}

              {selectedType === 'csv' && (
                <div>
                  <label htmlFor="wiz-csvContent" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t('fields.csvContent')}
                  </label>
                  <textarea
                    id="wiz-csvContent"
                    dir="ltr"
                    value={credentials.csvContent || ''}
                    onChange={(e) => handleFieldChange('csvContent', e.target.value)}
                    rows={10}
                    placeholder={`displayName,type,subType,upn,email,department,adTier,status\nJohn Doe,human,employee,john@example.com,john@example.com,Engineering,tier_2,active`}
                    className="w-full px-3 py-2 border border-[var(--border-default)] rounded-lg text-xs font-mono bg-[var(--bg-primary)] text-[var(--text-primary)] resize-y"
                  />
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    {t('hints.csv')}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {!existing && (
                  <button
                    onClick={() => setStep('choose')}
                    className="flex-1 py-2 text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    {tCommon('back')}
                  </button>
                )}
                <button
                  onClick={() => setStep('test')}
                  disabled={!name.trim()}
                  className="flex-1 py-2 text-xs font-medium bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {t('nextTest')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Test Connection */}
          {step === 'test' && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  {t('testIntro')}
                </p>

                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-6 py-2.5 text-sm font-medium bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('testing')}
                    </span>
                  ) : (
                    t('testConnection')
                  )}
                </button>

                {testResult && (
                  <div
                    role="status"
                    className="mt-4 p-3 rounded-lg text-xs text-start border bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    style={{ borderColor: testResult.ok ? 'var(--color-low)' : 'var(--color-critical)' }}
                  >
                    <p className="font-semibold">{testResult.ok ? t('testSuccess') : t('testFailedTitle')}</p>
                    {testResult.message && <p className="mt-1 break-words" dir="auto"><bdi>{testResult.message}</bdi></p>}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('configure'); setTestResult(null) }}
                  className="flex-1 py-2 text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  {tCommon('back')}
                </button>
                {testResult?.ok && (
                  <button
                    onClick={() => setStep('confirm')}
                    className="flex-1 py-2 text-xs font-medium bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
                  >
                    {t('nextConfirm')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && selectedType && (
            <div className="space-y-4">
              <dl className="bg-[var(--bg-secondary)] rounded-lg p-4 space-y-2">
                <div className="flex justify-between gap-3 text-xs">
                  <dt className="text-[var(--text-secondary)]">{t('fields.name')}</dt>
                  <dd className="text-[var(--text-primary)] font-medium"><bdi>{name}</bdi></dd>
                </div>
                <div className="flex justify-between gap-3 text-xs">
                  <dt className="text-[var(--text-secondary)]">{t('summaryType')}</dt>
                  <dd className="text-[var(--text-primary)]"><bdi>{selectedLabel}</bdi></dd>
                </div>
                {!existing && (
                  <div className="flex justify-between gap-3 text-xs">
                    <dt className="text-[var(--text-secondary)]">{t('summaryFrequency')}</dt>
                    <dd className="text-[var(--text-primary)]">{t('everySixHours')}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-xs">
                  <dt className="text-[var(--text-secondary)]">{t('summaryTest')}</dt>
                  <dd className="font-semibold" style={{ color: 'var(--color-low-text)' }}>{t('passed')}</dd>
                </div>
              </dl>

              <p className="text-xs text-[var(--text-secondary)]">
                {existing ? t('reconnectSaveNote') : t('saveNote')}
              </p>

              {error && (
                <div role="alert" className="p-3 rounded-lg border bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs" style={{ borderColor: 'var(--color-critical)' }}>
                  <bdi>{error}</bdi>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('test')}
                  className="flex-1 py-2 text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  {tCommon('back')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2 text-xs font-medium bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors disabled:opacity-50"
                >
                  {saving ? t('saving') : existing ? t('saveAndSync') : t('save')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FormField({
  label,
  field,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  field: string
  value?: string
  onChange: (field: string, value: string) => void
  placeholder?: string
  type?: string
}) {
  const id = `wiz-${field}`
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</label>
      <input
        id={id}
        type={type}
        dir={field === '__name' ? 'auto' : 'ltr'}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        value={value || ''}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-[var(--border-default)] rounded-lg text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
      />
    </div>
  )
}
