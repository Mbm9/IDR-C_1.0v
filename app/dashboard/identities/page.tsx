'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useIdentityList } from '@/lib/hooks/use-identities'
import { IdentityFilters } from '@/components/dashboard/identity-filters'
import { IdentityTable } from '@/components/dashboard/identity-table'
import { TONE_TEXT } from '@/components/ui/tone'

export default function IdentitiesPage() {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('riskScore')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const t = useTranslations('identity')
  const tCommon = useTranslations('common')
  const tTable = useTranslations('identityTable')

  const queryFilters = {
    ...filters,
    page,
    pageSize: 25,
    sortBy,
    sortOrder,
  }

  const { data, isLoading, error } = useIdentityList(queryFilters)

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev }
      if (value === '' || value === undefined) {
        delete next[key]
      } else {
        next[key] = value
      }
      return next
    })
    setPage(1)
  }, [])

  const handleReset = useCallback(() => {
    setFilters({})
    setPage(1)
  }, [])

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
    setPage(1)
  }, [sortBy])

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('explorer')}</h2>
        {data && (
          <span className="text-sm text-[var(--text-secondary)]">
            {t('identitiesFound', { count: data.total })}
          </span>
        )}
      </div>

      <IdentityFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
      />

      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        {isLoading ? (
          <div className="p-12 text-center text-[var(--text-secondary)] animate-pulse">
            {t('loadingIdentities')}
          </div>
        ) : error ? (
          <div className={`p-12 text-center ${TONE_TEXT.critical}`} role="alert">
            {t('failedToLoad')}
          </div>
        ) : data ? (
          <>
            <IdentityTable
              data={data.data}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)]">
                <p className="text-sm text-[var(--text-secondary)]">
                  {tTable('pageOf', { page: data.page, total: totalPages })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                  >
                    {tCommon('previous')}
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                  >
                    {tCommon('next')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
