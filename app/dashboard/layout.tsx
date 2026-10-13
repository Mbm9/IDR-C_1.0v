import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { CommandPalette } from '@/components/dashboard/command-palette'
import { QuickStartChecklist } from '@/components/onboarding/quick-start-checklist'
import { KeyboardShortcutsProvider } from '@/components/dashboard/keyboard-shortcuts-provider'
import { TONE_TEXT } from '@/components/ui/tone'

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useTranslations('dashboardShell')
  return (
    <KeyboardShortcutsProvider>
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <Sidebar />
      <CommandPalette />
      <div className="lg:ps-60 print:ps-0 flex flex-col min-h-screen transition-all duration-200">
        <Header />
        {isDemoMode && (
          <div className="px-4 lg:px-6 pt-3 print:hidden">
            <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-[var(--radius-card)] text-caption font-medium bg-[var(--color-medium-bg)] ${TONE_TEXT.medium}`} role="status">
              <span>{t('demoBanner')}</span>
              <Link
                href="/dashboard/integrations"
                className="whitespace-nowrap underline font-semibold hover:opacity-80 transition-opacity"
              >
                {t('connectNow')}
              </Link>
            </div>
          </div>
        )}
        <div className="print:hidden"><QuickStartChecklist /></div>
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px]">
          {children}
        </main>
      </div>
    </div>
    </KeyboardShortcutsProvider>
  )
}
