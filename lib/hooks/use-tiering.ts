'use client'

import { useQuery } from '@tanstack/react-query'

export interface TieringData {
  tierCounts: Record<string, number>
  totalIdentities: number
  heatmap: Record<string, Record<string, number>>
  /** All violating identities; crossTierIdentities holds the 50 riskiest. */
  tierViolationCount: number
  crossTierIdentities: Array<{
    id: string
    displayName: string
    type: string
    adTier: string
    effectiveTier: string | null
    riskScore: number
    status: string
  }>
  tier0Identities: Array<{
    id: string
    displayName: string
    type: string
    subType: string
    status: string
    riskScore: number
  }>
  tier0Resources: Array<{
    id: string
    name: string
    type: string
    criticality: string
    environment: string
  }>
  topTierIdentities: Array<{
    id: string
    displayName: string
    type: string
    subType: string
    status: string
    riskScore: number
  }>
  topTierResources: Array<{
    id: string
    name: string
    type: string
    criticality: string
    environment: string
  }>
  unclassifiedIdentities: Array<{
    id: string
    displayName: string
    type: string
    subType: string
    sourceSystem: string
  }>
}

export function useTieringData() {
  return useQuery<TieringData>({
    queryKey: ['tiering'],
    queryFn: async () => {
      const res = await fetch('/api/tiering')
      if (!res.ok) throw new Error('Failed to fetch tiering data')
      return res.json()
    },
    staleTime: 30_000,
  })
}
