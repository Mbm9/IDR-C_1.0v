import { useTranslations } from 'next-intl'
import { CardSkeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  const t = useTranslations('common')
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>
      <div className="h-7 rounded w-48 bg-[var(--bg-tertiary)]" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 h-64" />
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 h-64" />
      </div>
    </div>
  )
}
