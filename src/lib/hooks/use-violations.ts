'use client'

import { useQuery } from '@tanstack/react-query'

export interface ViolationListItem {
  id: string
  violationType: string
  severity: string
  status: string
  detectedAt: string
  remediatedAt: string | null
  exceptionReason: string | null
  exceptionExpiresAt: string | null
  policyName: string | null
  identityId: string | null
  identityName: string | null
  identityType: string | null
}

export interface ViolationSummary {
  bySeverity: Record<string, number>
  byType: Record<string, number>
  byStatus: Record<string, number>
  remediationRate: number
}

export interface ViolationException {
  id: string
  violationType: string
  severity: string
  exceptionReason: string | null
  exceptionExpiresAt: string | null
  identityName: string | null
  identityId: string | null
}

export interface ViolationResponse {
  data: ViolationListItem[]
  total: number
  page: number
  pageSize: number
  summary: ViolationSummary
  exceptions: ViolationException[]
}

export function useViolationList(filters: Record<string, string | number>) {
  const searchParams = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== null) {
      searchParams.set(key, String(value))
    }
  })

  return useQuery<ViolationResponse>({
    queryKey: ['violations', filters],
    queryFn: async () => {
      const res = await fetch(`/api/violations?${searchParams.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch violations')
      return res.json()
    },
    staleTime: 30_000,
  })
}
