'use client'

import { useQuery } from '@tanstack/react-query'

export interface OverviewMetrics {
  totalIdentities: number
  humanIdentities: number
  nonHumanIdentities: number
  activeViolations: number
  tierViolations: number
  tierCompliancePercentage: number
  riskDistribution: Record<string, number>
  riskTrendData: Array<{ date: string; avgRiskScore: number }>
  topRiskyIdentities: Array<{
    id: string
    displayName: string
    type: string
    subType: string
    riskScore: number
    adTier: string
    effectiveTier: string | null
    tierViolation: boolean
    status: string
  }>
  pendingActions: Array<{
    type: string
    label: string
    count: number
  }>
  integrationHealth: Array<{
    id: string
    name: string
    type: string
    syncStatus: string
    lastSyncAt: string | null
  }>
  activeThreats: number
  attackPathsCount: number
  shadowAdminCount: number
  exposuresCount: number
}

export function useOverviewMetrics() {
  return useQuery<OverviewMetrics>({
    queryKey: ['metrics', 'overview'],
    queryFn: async () => {
      const res = await fetch('/api/metrics/overview')
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
