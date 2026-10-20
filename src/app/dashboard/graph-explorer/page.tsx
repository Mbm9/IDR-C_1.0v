'use client'

import { useTranslations } from 'next-intl'
import { Compass } from 'lucide-react'
import { GraphExplorer } from '@/components/dashboard/graph-explorer'

export default function GraphExplorerPage() {
  const t = useTranslations('graphExplorer')
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Compass className="w-6 h-6 text-[color:color-mix(in_srgb,var(--color-high)_70%,var(--text-primary))]" />
          {t('title')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">{t('subtitle')}</p>
      </div>
      <GraphExplorer />
    </div>
  )
}
