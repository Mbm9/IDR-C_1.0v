'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { MetricCard } from '@/components/ui/metric-card'
import { SupplyChainTree } from '@/components/dashboard/supply-chain-tree'

interface HighRiskOwner {
  owner: { id: string; name: string; department: string; tier: string }
  nhiCount: number
  criticalResourceCount: number
  successionPlan: boolean
}

interface DepartureImpact {
  departingIdentity: { id: string; name: string; department: string; tier: string }
  impact: {
    orphanedNhis: { id: string; name: string; subType: string; tier: string }[]
    affectedResources: { id: string; name: string; type: string; tier: string; criticality: string }[]
    directReports: { id: string; name: string; tier: string }[]
    criticalResourceCount: number
  }
  recommendations: {
    transferCandidates: { id: string; name: string; department: string }[]
    suggestedActions: string[]
  }
}

interface SupplyChainDetail {
  owner: any
  ownedNhis: any[]
  totalBlastRadius: number
  successionPlan: boolean
}

export default function SupplyChainPage() {
  const t = useTranslations('supplyChain')

  const [highRisk, setHighRisk] = useState<HighRiskOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)
  const [supplyDetail, setSupplyDetail] = useState<SupplyChainDetail | null>(null)
  const [departureImpact, setDepartureImpact] = useState<DepartureImpact | null>(null)
  const [simulatingDeparture, setSimulatingDeparture] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchHighRisk = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/supply-chain/high-risk')
      if (res.ok) {
        const data = await res.json()
        setHighRisk(data.items || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHighRisk() }, [fetchHighRisk])

  const loadSupplyChain = useCallback(async (identityId: string) => {
    setSelectedOwner(identityId)
    setDetailLoading(true)
    setDepartureImpact(null)
    try {
      const res = await fetch('/api/supply-chain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId }),
      })
      if (res.ok) {
        setSupplyDetail(await res.json())
      }
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const simulateDeparture = useCallback(async (identityId: string) => {
    setSimulatingDeparture(true)
    try {
      const res = await fetch('/api/supply-chain/simulate-departure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId }),
      })
      if (res.ok) {
        setDepartureImpact(await res.json())
      }
    } finally {
      setSimulatingDeparture(false)
    }
  }, [])

  const spofCount = highRisk.filter(h => h.criticalResourceCount > 0 && !h.successionPlan).length
  const avgNhis = highRisk.length > 0
    ? (highRisk.reduce((s, h) => s + h.nhiCount, 0) / highRisk.length).toFixed(1)
    : '0'

  if (loading && highRisk.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('title')}</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label={t('totalNhiOwners')} value={highRisk.length} color="blue" />
        <MetricCard label={t('spofChains')} value={spofCount} color="red" />
        <MetricCard label={t('avgNhisPerOwner')} value={avgNhis} color="orange" />
      </div>

      {/* Key Person Risk table */}
      <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="p-4 border-b border-[var(--border-default)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{t('keyPersonRisk')}</h3>
        </div>
        <div tabIndex={0} role="region" aria-label={t('keyPersonRisk')} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('ownerCol')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('department')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('ownedNhis')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('criticalResources')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('succession')}</th>
                <th className="text-start py-3 px-4 text-[var(--text-secondary)] font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {highRisk.map((item) => (
                <tr
                  key={item.owner.id}
                  className={`border-b border-[var(--border-default)] hover:bg-[var(--bg-secondary)] cursor-pointer ${selectedOwner === item.owner.id ? 'bg-[var(--bg-secondary)]' : ''}`}
                  onClick={() => loadSupplyChain(item.owner.id)}
                >
                  <td className="py-3 px-4 text-[var(--text-primary)] font-medium">
                    <button
                      type="button"
                      aria-pressed={selectedOwner === item.owner.id}
                      onClick={(e) => { e.stopPropagation(); loadSupplyChain(item.owner.id) }}
                      className="text-start hover:text-[color:color-mix(in_srgb,var(--color-info)_70%,var(--text-primary))] hover:underline"
                    >
                      <bdi>{item.owner.name}</bdi>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)]"><bdi>{item.owner.department || '-'}</bdi></td>
                  <td className="py-3 px-4 text-[var(--text-primary)] font-semibold">{item.nhiCount}</td>
                  <td className="py-3 px-4">
                    <span className="font-medium" style={{ color: item.criticalResourceCount > 0 ? 'color-mix(in srgb, var(--color-critical) 70%, var(--text-primary))' : 'var(--text-primary)' }}>
                      {item.criticalResourceCount}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                      item.successionPlan
                        ? 'bg-[var(--color-low-bg)] text-[color:color-mix(in_srgb,var(--color-low)_60%,var(--text-primary))]'
                        : 'bg-[var(--color-critical-bg)] text-[color:color-mix(in_srgb,var(--color-critical)_60%,var(--text-primary))]'
                    }`}>
                      {item.successionPlan ? t('hasPlan') : t('noPlan')}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); simulateDeparture(item.owner.id) }}
                      disabled={simulatingDeparture}
                      className="px-3 py-1 text-xs bg-[color:color-mix(in_srgb,var(--color-high)_80%,black)] text-white rounded hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                    >
                      {t('simulateDeparture')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {highRisk.length === 0 && (
          <div className="p-8 text-center text-[var(--text-secondary)]">{t('noOwners')}</div>
        )}
      </div>

      {/* Supply chain detail */}
      {detailLoading && (
        <div role="status" className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-12 text-center">
          <div aria-hidden className="animate-spin h-8 w-8 border-4 border-[var(--color-info)] border-t-transparent rounded-full mx-auto" />
        </div>
      )}

      {supplyDetail && !detailLoading && (
        <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-default)] p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
            {t('supplyChainFor')} <bdi>{supplyDetail.owner.name}</bdi>
          </h3>
          <SupplyChainTree owner={supplyDetail.owner} ownedNhis={supplyDetail.ownedNhis} />
        </div>
      )}

      {/* Departure impact */}
      {departureImpact && (
        <div className="bg-[var(--color-critical-bg)] border border-[var(--color-critical)] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))] mb-3">
            {t('departureImpact')}: <bdi>{departureImpact.departingIdentity.name}</bdi>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{departureImpact.impact.orphanedNhis.length}</p>
              <p className="text-sm text-[var(--text-secondary)]">{t('orphanedNhis')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{departureImpact.impact.affectedResources.length}</p>
              <p className="text-sm text-[var(--text-secondary)]">{t('affectedResources')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[color:color-mix(in_srgb,var(--color-critical)_70%,var(--text-primary))]">{departureImpact.impact.criticalResourceCount}</p>
              <p className="text-sm text-[var(--text-secondary)]">{t('criticalImpacted')}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">{t('suggestedActions')}</p>
            <ul className="list-disc list-inside text-sm text-[var(--text-secondary)] space-y-1">
              {departureImpact.recommendations.suggestedActions.map((action, i) => (
                <li key={i}><bdi>{action}</bdi></li>
              ))}
            </ul>
          </div>
          {departureImpact.recommendations.transferCandidates.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{t('transferCandidates')}</p>
              <div className="flex flex-wrap gap-2">
                {departureImpact.recommendations.transferCandidates.map(c => (
                  <bdi key={c.id} className="text-xs bg-[var(--bg-primary)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border-default)]">
                    {c.name}
                  </bdi>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
