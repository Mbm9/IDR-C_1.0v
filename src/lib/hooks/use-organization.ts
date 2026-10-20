'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface OrganizationData {
  organization: {
    name: string
    domain: string
    industry: string | null
    regulatoryFrameworks: string[] | null
    adForestName: string | null
  }
  branding: { name: string | null; logo: string | null; logoBackground: boolean; updatedAt: string | null }
}

export const ORGANIZATION_QUERY_KEY = ['organization'] as const

/** The signed-in user's organization and its branding. */
export function useOrganization() {
  return useQuery<OrganizationData>({
    queryKey: ORGANIZATION_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/settings/organization')
      if (!res.ok) throw new Error('Failed to fetch organization')
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
}

/** Update branding (admin). `null` resets a field to the product default. */
export function useUpdateBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name?: string | null; logo?: string | null; logoBackground?: boolean }) => {
      const res = await fetch('/api/settings/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.details?.fieldErrors?.logo?.[0] || data?.error || 'Save failed')
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEY }),
  })
}

/** Branding for the sign-in and sign-up pages (single-organization installs only). */
export function usePublicBranding() {
  return useQuery<{ name: string | null; logo: string | null; logoBackground: boolean }>({
    queryKey: ['public-branding'],
    queryFn: async () => {
      const res = await fetch('/api/branding')
      if (!res.ok) return { name: null, logo: null, logoBackground: false }
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
}
