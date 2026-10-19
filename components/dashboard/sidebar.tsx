'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandMark } from '@/components/ui/brand-mark'
import { useOrganization } from '@/lib/hooks/use-organization'
import { brandName } from '@/lib/branding-shared'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard, Users, Shield, Key, AlertTriangle, Plug, ScrollText, Settings,
  ChevronLeft, ChevronRight, Menu, X, Network, Route, Radar,
  Upload, Scale, ShieldAlert, Compass, ListChecks, Radio, FileText,
} from 'lucide-react'

// MVP nav — trimmed to the essence. Deferred pages remain in the repo and load by direct URL;
// they're just not surfaced here (re-add a line to re-enable).
const NAV_SECTIONS = [
  {
    labelKey: 'posture' as const,
    items: [
      { href: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard },
      { href: '/dashboard/identities', labelKey: 'identities' as const, icon: Users },
      { href: '/dashboard/tiering', labelKey: 'tiering' as const, icon: Shield },
      { href: '/dashboard/entitlements', labelKey: 'entitlements' as const, icon: Key },
      { href: '/dashboard/exposures', labelKey: 'exposures' as const, icon: ShieldAlert },
    ],
  },
  {
    labelKey: 'attackSurface' as const,
    items: [
      { href: '/dashboard/tier0-live', labelKey: 'tier0Live' as const, icon: Radio },
      { href: '/dashboard/attack-paths', labelKey: 'attackPaths' as const, icon: Route },
      { href: '/dashboard/blast-radius', labelKey: 'blastRadius' as const, icon: Radar },
      { href: '/dashboard/graph', labelKey: 'graph' as const, icon: Network },
      { href: '/dashboard/graph-explorer', labelKey: 'graphExplorer' as const, icon: Compass },
    ],
  },
  {
    labelKey: 'findings' as const,
    items: [
      { href: '/dashboard/issues', labelKey: 'issues' as const, icon: ListChecks },
      { href: '/dashboard/violations', labelKey: 'violations' as const, icon: AlertTriangle },
      { href: '/dashboard/compliance', labelKey: 'compliance' as const, icon: Scale },
      { href: '/dashboard/reports', labelKey: 'reports' as const, icon: FileText },
    ],
  },
  {
    labelKey: 'operations' as const,
    items: [
      { href: '/dashboard/import', labelKey: 'import' as const, icon: Upload },
      { href: '/dashboard/integrations', labelKey: 'integrations' as const, icon: Plug },
      { href: '/dashboard/audit', labelKey: 'audit' as const, icon: ScrollText },
      { href: '/dashboard/settings', labelKey: 'settings' as const, icon: Settings },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname() ?? ''
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useTranslations('nav')
  const tSections = useTranslations('navSections')
  const tCommon = useTranslations('common')
  const tSidebar = useTranslations('sidebar')

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const sidebarWidth = collapsed ? 'w-16' : 'w-60'
  const branding = useOrganization().data?.branding

  const navContent = (showLabels: boolean) => (
    <>
      <div className={`flex items-center ${showLabels ? 'px-5 py-5' : 'px-2 py-5 justify-center'}`}>
        <BrandMark logo={branding?.logo} size={32} />
        {showLabels && (
          <div className="ms-3 min-w-0">
            <h1 className="text-body font-semibold text-white leading-tight truncate" title={brandName(branding)}>{brandName(branding)}</h1>
            <p className="text-micro text-slate-400">{tSidebar('tagline')}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 space-y-5 overflow-y-auto" aria-label={tSidebar('mainNav')}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.labelKey} role="group" aria-label={tSections(section.labelKey)}>
            {showLabels && (
              <p aria-hidden="true" className="px-3 mb-1 text-[10px] font-semibold text-slate-400 tracking-widest">
                {tSections(section.labelKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={!showLabels ? t(item.labelKey) : undefined}
                    aria-label={!showLabels ? t(item.labelKey) : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`
                      flex items-center gap-3 rounded-md transition-colors relative
                      ${showLabels ? 'px-3 py-2' : 'px-0 py-2 justify-center'}
                      ${active
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }
                    `}
                  >
                    {active && (
                      <span className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[var(--color-info)] rounded-e" />
                    )}
                    <Icon size={18} className="flex-shrink-0" aria-hidden="true" />
                    {showLabels && (
                      <span className="text-body font-medium truncate">{t(item.labelKey)}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse button (desktop only) */}
      {showLabels !== undefined && (
        <div className="hidden lg:block px-2 py-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
            aria-label={collapsed ? tSidebar('expand') : tCommon('collapse')}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={18} className="rtl:-scale-x-100" aria-hidden="true" /> : <ChevronLeft size={18} className="rtl:-scale-x-100" aria-hidden="true" />}
            {showLabels && <span className="text-caption">{tCommon('collapse')}</span>}
          </button>
        </div>
      )}
    </>
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 start-4 z-50 p-2 rounded-md bg-slate-900 text-white"
        aria-label={mobileOpen ? tSidebar('closeMenu') : tSidebar('openMenu')}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={`print:hidden lg:hidden fixed inset-y-0 start-0 z-40 w-60 bg-slate-900 flex flex-col transform transition-transform ${mobileOpen ? 'translate-x-0 rtl:-translate-x-0 visible' : 'ltr:-translate-x-full rtl:translate-x-full invisible'}`}>
        {navContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside className={`print:hidden hidden lg:flex ${sidebarWidth} flex-col fixed inset-y-0 start-0 bg-slate-900 transition-all duration-200`}>
        {navContent(!collapsed)}
      </aside>
    </>
  )
}
