'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface UserPreferences {
  notifications?: {
    violations?: boolean
    certifications?: boolean
    integrations?: boolean
    aiAnalysis?: boolean
    weeklyReports?: boolean
    emailEnabled?: boolean
  }
  appearance?: {
    theme?: 'light' | 'dark' | 'system'
    language?: 'en' | 'ar'
    timezone?: string
  }
  tables?: {
    defaultPageSize?: number
    columnVisibility?: Record<string, string[]>
  }
  dashboard?: {
    hiddenWidgets?: string[]
  }
}

export function usePreferences() {
  return useQuery<UserPreferences>({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/settings/preferences')
      if (!res.ok) return {}
      const data = await res.json()
      return data.preferences || {}
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      const res = await fetch('/api/settings/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to save preferences')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preferences'], data.preferences)
    },
  })
}
