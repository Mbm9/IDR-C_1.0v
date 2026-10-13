'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import {
  BookOpen,
  Code2,
  Plug,
  Shield,
  Search,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'
import { CONNECTOR_REGISTRY } from '@/lib/connectors/registry'
import type { ConnectorMeta } from '@/lib/connectors/registry'
import { getDocsContent, plainText } from './content'
import type { DocsContent } from './content.types'
import { RichText } from './rich-text'

/*
 * In-app documentation.
 *
 * Long-form content lives in per-locale typed modules (content.en.ts /
 * content.ar.ts, selected by useLocale()); short UI chrome lives in the
 * `docs` namespace of messages/*.json. Layout uses logical properties
 * (ms/me/ps/pe/start/end) so it mirrors correctly in RTL, and technical
 * tokens (paths, methods, credentials, control IDs) are rendered dir="ltr".
 */

type TabId = 'guide' | 'api' | 'connectors' | 'compliance'

const CATEGORY_ORDER: ConnectorMeta['category'][] = [
  'directory',
  'sso',
  'iga',
  'pam',
  'itsm',
  'itdr',
  'secrets',
  'siem',
  'certificate',
  'import',
]

/** Case-insensitive match against text with inline markup stripped. */
function matches(text: string, lowerSearch: string): boolean {
  return plainText(text).toLowerCase().includes(lowerSearch)
}

/* ------------------------------------------------------------------ */
/*  Helper: method badge color                                         */
/* ------------------------------------------------------------------ */

function methodColor(method: string): string {
  switch (method) {
    case 'GET':
      return 'var(--color-success)'
    case 'POST':
      return 'var(--color-info)'
    case 'PUT':
      return 'var(--color-warning)'
    case 'DELETE':
      return 'var(--color-critical)'
    default:
      return 'var(--text-secondary)'
  }
}

/* ------------------------------------------------------------------ */
/*  Accordion component                                                */
/* ------------------------------------------------------------------ */

function Accordion({
  title,
  aside,
  children,
  defaultOpen = false,
  forceOpen,
}: {
  title: React.ReactNode
  /** Interactive content shown in the header row but outside the toggle button (no nested controls). */
  aside?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  forceOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = forceOpen !== undefined ? forceOpen : open

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex items-center gap-3 pe-4">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 ps-4 py-3 text-start font-medium transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <span className="flex min-w-0 items-center gap-2">{title}</span>
          {/* Collapsed: chevron points toward the inline end (right in LTR, left in RTL). */}
          <span
            className={`shrink-0 transition-transform duration-200 ${isOpen ? '' : 'ltr:-rotate-90 rtl:rotate-90'}`}
          >
            <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
          </span>
        </button>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{
          maxHeight: isOpen ? '5000px' : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
      {message}
    </p>
  )
}

/** Dashboard route link rendered as an LTR code-like chip. */
function RouteLink({ href, chip = false }: { href: string; chip?: boolean }) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      dir="ltr"
      className={`inline-flex items-center gap-1 text-xs font-mono ${chip ? 'rounded px-2 py-0.5' : ''}`}
      style={{
        color: 'var(--color-accent)',
        backgroundColor: chip ? 'var(--bg-tertiary)' : undefined,
      }}
    >
      {href}
      <ExternalLink className="h-3 w-3" />
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab: User Guide                                                    */
/* ------------------------------------------------------------------ */

function GuideTab({ search, content }: { search: string; content: DocsContent }) {
  const t = useTranslations('docs')
  const lowerSearch = search.toLowerCase()
  const filtered = content.guide.filter(
    (s) => !search || matches(s.title, lowerSearch) || matches(s.description, lowerSearch)
  )

  if (filtered.length === 0) {
    return <EmptyState message={t('guide.noResults')} />
  }

  return (
    <div className="flex flex-col gap-3">
      {filtered.map((section) => (
        <Accordion
          key={section.id}
          forceOpen={search.length > 0 ? true : undefined}
          title={
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {section.title}
            </span>
          }
          aside={<RouteLink href={section.path} chip />}
        >
          <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <RichText text={section.description} />
          </p>

          <div className="mb-3">
            <h4
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t('guide.keyFeatures')}
            </h4>
            <ul className="flex flex-col gap-1">
              {section.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--color-accent)' }} className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                  <span><RichText text={f} /></span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4
              className="mb-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {t('guide.availableActions')}
            </h4>
            <ul className="flex flex-col gap-1">
              {section.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--color-success)' }} className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                  <span><RichText text={a} /></span>
                </li>
              ))}
            </ul>
          </div>
        </Accordion>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab: API Reference                                                 */
/* ------------------------------------------------------------------ */

function ApiTab({ search, content }: { search: string; content: DocsContent }) {
  const t = useTranslations('docs')
  const lowerSearch = search.toLowerCase()
  const filtered = content.api.filter(
    (g) =>
      !search ||
      matches(g.title, lowerSearch) ||
      g.endpoints.some(
        (e) => e.path.toLowerCase().includes(lowerSearch) || matches(e.description, lowerSearch)
      )
  )

  if (filtered.length === 0) {
    return <EmptyState message={t('api.noResults')} />
  }

  return (
    <div className="flex flex-col gap-3">
      {filtered.map((group) => {
        const matchingEndpoints = search
          ? group.endpoints.filter(
              (e) =>
                e.path.toLowerCase().includes(lowerSearch) ||
                matches(e.description, lowerSearch) ||
                matches(group.title, lowerSearch)
            )
          : group.endpoints

        return (
          <Accordion
            key={group.id}
            forceOpen={search.length > 0 ? true : undefined}
            title={
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {group.title}
                <span className="ms-2 text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
                  ({t('api.endpointCount', { count: matchingEndpoints.length })})
                </span>
              </span>
            }
          >
            <div className="flex flex-col gap-3">
              {matchingEndpoints.map((ep) => (
                <div
                  key={`${ep.method} ${ep.path}`}
                  className="rounded-md border p-3"
                  style={{
                    borderColor: 'var(--border-default)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {/* Method + path read as one LTR token, e.g. "GET /api/identities". */}
                    <span dir="ltr" className="inline-flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block rounded px-2 py-0.5 text-xs font-bold font-mono"
                        style={{
                          color: methodColor(ep.method),
                          backgroundColor: 'var(--bg-tertiary)',
                        }}
                      >
                        {ep.method}
                      </span>
                      <code className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                        {ep.path}
                      </code>
                    </span>
                    <span
                      className="ms-auto rounded px-2 py-0.5 text-xs"
                      title={`${t('api.requiredRole')}: ${ep.role}`}
                      style={{
                        color: 'var(--text-tertiary)',
                        backgroundColor: 'var(--bg-tertiary)',
                      }}
                    >
                      {t(`roles.${ep.role}`)}
                    </span>
                  </div>
                  <p className="mb-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <RichText text={ep.description} />
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    <RichText text={ep.note} />
                  </p>
                </div>
              ))}
            </div>
          </Accordion>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab: Connectors                                                    */
/* ------------------------------------------------------------------ */

function CredentialList({ creds, required }: { creds: string[]; required: boolean }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {creds.map((cred) => (
        <code
          key={cred}
          dir="ltr"
          className="rounded px-1.5 py-0.5 text-xs font-mono"
          style={{
            color: required ? 'var(--color-critical)' : 'var(--text-secondary)',
            backgroundColor: 'var(--bg-tertiary)',
          }}
        >
          {cred}
        </code>
      ))}
    </div>
  )
}

function SectionHeading({ children, warning = false }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <h5
      className="mb-1.5 text-xs font-bold uppercase tracking-wider"
      style={{ color: warning ? 'var(--color-warning)' : 'var(--text-tertiary)' }}
    >
      {children}
    </h5>
  )
}

function TextList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className="flex flex-col gap-1 ps-4" style={{ listStyleType: ordered ? 'decimal' : 'disc' }}>
      {items.map((item, i) => (
        <li key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <RichText text={item} />
        </li>
      ))}
    </Tag>
  )
}

function ConnectorsTab({ search, content }: { search: string; content: DocsContent }) {
  const t = useTranslations('docs')
  const lowerSearch = search.toLowerCase()

  const grouped: Partial<Record<ConnectorMeta['category'], ConnectorMeta[]>> = {}
  for (const cat of CATEGORY_ORDER) {
    const categoryLabel = t(`categories.${cat}`)
    const connectors = CONNECTOR_REGISTRY.filter((c) => {
      if (c.category !== cat) return false
      if (!search) return true
      const guide = content.connectors[c.type]
      return (
        c.label.toLowerCase().includes(lowerSearch) ||
        c.category.toLowerCase().includes(lowerSearch) ||
        categoryLabel.toLowerCase().includes(lowerSearch) ||
        (guide !== undefined &&
          (matches(guide.label, lowerSearch) ||
            matches(guide.description, lowerSearch) ||
            guide.dataPulled.some((d) => matches(d, lowerSearch)) ||
            guide.prerequisites.some((p) => matches(p, lowerSearch))))
      )
    })
    if (connectors.length > 0) {
      grouped[cat] = connectors
    }
  }

  const categories = CATEGORY_ORDER.filter((cat) => grouped[cat])

  if (categories.length === 0) {
    return <EmptyState message={t('connectors.noResults')} />
  }

  return (
    <div className="flex flex-col gap-3">
      {categories.map((cat) => {
        const list = grouped[cat] ?? []
        return (
          <Accordion
            key={cat}
            defaultOpen={true}
            forceOpen={search.length > 0 ? true : undefined}
            title={
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t(`categories.${cat}`)}
                <span className="ms-2 text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
                  ({t('connectors.connectorCount', { count: list.length })})
                </span>
              </span>
            }
          >
            <div className="flex flex-col gap-4">
              {list.map((connector) => {
                const guide = content.connectors[connector.type]
                return (
                  <div
                    key={connector.type}
                    className="rounded-lg border p-4"
                    style={{
                      borderColor: 'var(--border-default)',
                      backgroundColor: 'var(--bg-primary)',
                    }}
                  >
                    {/* Header */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        <bdi>{guide?.label ?? connector.label}</bdi>
                      </h4>
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium uppercase"
                        style={{
                          color: 'var(--color-accent)',
                          backgroundColor: 'var(--bg-tertiary)',
                        }}
                      >
                        {t(`categories.${connector.category}`)}
                      </span>
                    </div>
                    <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      <RichText text={guide?.description ?? connector.description} />
                    </p>

                    {guide && (
                      <div className="flex flex-col gap-4">
                        <div>
                          <SectionHeading>{t('connectors.prerequisites')}</SectionHeading>
                          <TextList items={guide.prerequisites} />
                        </div>

                        <div>
                          <SectionHeading>{t('connectors.setupSteps')}</SectionHeading>
                          <TextList items={guide.setupSteps} ordered />
                        </div>

                        <div>
                          <SectionHeading>{t('connectors.dataImported')}</SectionHeading>
                          <TextList items={guide.dataPulled} />
                        </div>

                        <div>
                          <SectionHeading>{t('connectors.syncFrequency')}</SectionHeading>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            <RichText text={guide.syncFrequency} />
                          </p>
                        </div>

                        {/* Credentials */}
                        <div className="flex flex-wrap gap-4">
                          <div>
                            <SectionHeading>{t('connectors.requiredCredentials')}</SectionHeading>
                            <CredentialList creds={connector.requiredCredentials} required />
                          </div>
                          {connector.optionalCredentials.length > 0 && (
                            <div>
                              <SectionHeading>{t('connectors.optional')}</SectionHeading>
                              <CredentialList creds={connector.optionalCredentials} required={false} />
                            </div>
                          )}
                        </div>

                        <div>
                          <SectionHeading warning>{t('connectors.troubleshooting')}</SectionHeading>
                          <TextList items={guide.troubleshooting} />
                        </div>

                        {guide.notes && (
                          <div
                            className="rounded-md p-3 text-xs leading-relaxed"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                          >
                            <strong style={{ color: 'var(--color-info-text)' }}>{t('connectors.note')} </strong>
                            <RichText text={guide.notes} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fallback if no guide */}
                    {!guide && (
                      <div className="flex flex-wrap gap-4">
                        <div>
                          <SectionHeading>{t('connectors.requiredCredentials')}</SectionHeading>
                          <CredentialList creds={connector.requiredCredentials} required />
                        </div>
                        {connector.optionalCredentials.length > 0 && (
                          <div>
                            <SectionHeading>{t('connectors.optional')}</SectionHeading>
                            <CredentialList creds={connector.optionalCredentials} required={false} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Accordion>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab: Compliance                                                    */
/* ------------------------------------------------------------------ */

function ComplianceTab({ search, content }: { search: string; content: DocsContent }) {
  const t = useTranslations('docs')
  const lowerSearch = search.toLowerCase()

  const filtered = content.compliance
    .map((fw) => ({
      ...fw,
      rows: fw.rows.filter(
        (r) =>
          !search ||
          r.controlId.toLowerCase().includes(lowerSearch) ||
          matches(r.controlName, lowerSearch) ||
          matches(r.feature, lowerSearch) ||
          fw.acronym.toLowerCase().includes(lowerSearch) ||
          matches(fw.name, lowerSearch)
      ),
    }))
    .filter((fw) => fw.rows.length > 0)

  if (filtered.length === 0) {
    return <EmptyState message={t('compliance.noResults')} />
  }

  const thClass = 'px-3 py-2 text-start text-xs font-semibold uppercase tracking-wider'

  return (
    <div className="flex flex-col gap-3">
      {filtered.map((fw) => (
        <Accordion
          key={fw.id}
          defaultOpen={true}
          forceOpen={search.length > 0 ? true : undefined}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: 'var(--color-accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                <bdi>{fw.acronym}</bdi> ({fw.name})
              </span>
              <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
                ({t('compliance.controlCount', { count: fw.rows.length })})
              </span>
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th className={thClass} style={{ color: 'var(--text-tertiary)' }}>
                    {t('compliance.controlId')}
                  </th>
                  <th className={thClass} style={{ color: 'var(--text-tertiary)' }}>
                    {t('compliance.controlName')}
                  </th>
                  <th className={thClass} style={{ color: 'var(--text-tertiary)' }}>
                    {t('compliance.feature')}
                  </th>
                  <th className={thClass} style={{ color: 'var(--text-tertiary)' }}>
                    {t('compliance.dashboard')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {fw.rows.map((row) => (
                  <tr
                    key={row.controlId}
                    style={{ borderBottom: '1px solid var(--border-default)' }}
                  >
                    <td className="px-3 py-2">
                      <code
                        dir="ltr"
                        className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-mono font-semibold"
                        style={{
                          color: 'var(--color-accent)',
                          backgroundColor: 'var(--bg-tertiary)',
                        }}
                      >
                        {row.controlId}
                      </code>
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                      <RichText text={row.controlName} />
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                      <RichText text={row.feature} />
                    </td>
                    <td className="px-3 py-2">
                      <RouteLink href={row.link} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Accordion>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

const TABS: { id: TabId; icon: React.ReactNode }[] = [
  { id: 'guide', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'api', icon: <Code2 className="h-4 w-4" /> },
  { id: 'connectors', icon: <Plug className="h-4 w-4" /> },
  { id: 'compliance', icon: <Shield className="h-4 w-4" /> },
]

export default function DocsPage() {
  const t = useTranslations('docs')
  const locale = useLocale()
  const content = useMemo(() => getDocsContent(locale), [locale])
  const [activeTab, setActiveTab] = useState<TabId>('guide')
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {t('title')}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('subtitle')}
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
        />
        <input
          type="search"
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border py-2 ps-10 pe-4 text-sm outline-none transition-colors"
          style={{
            borderColor: 'var(--border-default)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        className="mb-6 flex gap-1 rounded-lg border p-1"
        style={{
          borderColor: 'var(--border-default)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={t(`tabs.${tab.id}`)}
            onClick={() => {
              setActiveTab(tab.id)
              setSearchQuery('')
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeTab === tab.id ? 'var(--bg-primary)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: activeTab === tab.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            {tab.icon}
            <span className="hidden sm:inline">{t(`tabs.${tab.id}`)}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'guide' && <GuideTab search={searchQuery} content={content} />}
      {activeTab === 'api' && <ApiTab search={searchQuery} content={content} />}
      {activeTab === 'connectors' && <ConnectorsTab search={searchQuery} content={content} />}
      {activeTab === 'compliance' && <ComplianceTab search={searchQuery} content={content} />}
    </>
  )
}
