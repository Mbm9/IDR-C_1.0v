'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Notification {
  id: string
  orgId: string
  userId: string
  type: string
  title: string
  message: string
  severity: string
  read: boolean
  link: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface NotificationResponse {
  data: Notification[]
  total: number
  unreadCount: number
  page: number
  pageSize: number
}

export function useNotifications(page = 1) {
  return useQuery<NotificationResponse>({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const res = await fetch(`/api/notifications?page=${page}&pageSize=20`)
      if (!res.ok) throw new Error('Failed to fetch notifications')
      return res.json()
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useUnreadCount() {
  return useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?pageSize=1')
      if (!res.ok) throw new Error('Failed to fetch unread count')
      const data = await res.json()
      return data.unreadCount
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
      })
      if (!res.ok) throw new Error('Failed to mark notification as read')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to mark all as read')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
