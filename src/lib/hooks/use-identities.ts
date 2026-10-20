'use client'

import { useQuery } from '@tanstack/react-query'
import type { IdentityFilter } from '@/lib/schemas/identity'

export interface IdentityListItem {
  id: string
  displayName: string
  type: string
  subType: string
  status: string
  adTier: string
  effectiveTier: string | null
  tierViolation: boolean
  riskScore: number
  sourceSystem: string
  email: string | null
  lastLogonAt: string | null
  createdAt: string
  dataQuality: { score?: number; completeness?: number; freshness?: number; accuracy?: number; fields?: Record<string, any> } | null
}

export interface IdentityListResponse {
  data: IdentityListItem[]
  total: number
  page: number
  pageSize: number
}

export function useIdentityList(filters: Partial<IdentityFilter>) {
  const searchParams = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== null) {
      searchParams.set(key, String(value))
    }
  })

  return useQuery<IdentityListResponse>({
    queryKey: ['identities', 'list', filters],
    queryFn: async () => {
      const res = await fetch(`/api/identities?${searchParams.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch identities')
      return res.json()
    },
    staleTime: 30_000,
  })
}

export interface IdentityDetail {
  identity: IdentityListItem & {
    upn: string | null
    samAccountName: string | null
    department: string | null
    riskFactors: any
    managerIdentityId: string | null
    ownerIdentityId: string | null
    passwordLastSetAt: string | null
    createdInSourceAt: string | null
    expiryAt: string | null
    updatedAt: string
  }
  accounts: Array<{
    id: string
    platform: string
    accountName: string
    accountType: string
    enabled: boolean
    lastAuthenticatedAt: string | null
    mfaEnabled: boolean
    mfaMethods: string[]
    privileged: boolean
  }>
  entitlements: Array<{
    id: string
    permissionType: string
    permissionName: string
    permissionScope: string | null
    adTierOfPermission: string
    grantedAt: string
    grantedBy: string | null
    lastUsedAt: string | null
    certificationStatus: string
    lastCertifiedAt: string | null
    riskTags: string[]
    resourceName: string | null
    resourceType: string | null
  }>
  groups: Array<{
    id: string
    membershipType: string
    addedAt: string
    groupName: string | null
    groupType: string | null
    groupAdTier: string | null
    isPrivileged: boolean | null
  }>
  violations: Array<{
    id: string
    violationType: string
    severity: string
    status: string
    detectedAt: string
    remediatedAt: string | null
    exceptionReason: string | null
    policyName: string | null
  }>
  timeline: Array<{
    id: string
    actionType: string
    rationale: string | null
    source: string
    createdAt: string
    actorName: string | null
  }>
  manager: { id: string; displayName: string } | null
  owner: { id: string; displayName: string } | null
}

export function useIdentityDetail(id: string) {
  return useQuery<IdentityDetail>({
    queryKey: ['identities', 'detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/identities/${id}`)
      if (!res.ok) throw new Error('Failed to fetch identity')
      return res.json()
    },
    enabled: !!id,
  })
}
