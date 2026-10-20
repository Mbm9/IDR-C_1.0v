'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ShortcutsState {
  showHelp: boolean
  setShowHelp: (v: boolean) => void
}

let globalSetShowHelp: ((v: boolean) => void) | null = null

export function useShortcutsHelpState(): ShortcutsState {
  const [showHelp, setShowHelp] = useState(false)
  globalSetShowHelp = setShowHelp
  return { showHelp, setShowHelp }
}

export function useKeyboardShortcuts() {
  const router = useRouter()
  const waitingForNav = useRef(false)
  const navTimeout = useRef<NodeJS.Timeout | null>(null)

  const navigate = useCallback((path: string) => {
    router.push(path)
  }, [router])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return
      }

      const key = e.key.toLowerCase()
      const meta = e.metaKey || e.ctrlKey

      // Handle 'g' navigation prefix
      if (waitingForNav.current) {
        waitingForNav.current = false
        if (navTimeout.current) clearTimeout(navTimeout.current)

        const navMap: Record<string, string> = {
          d: '/dashboard',
          i: '/dashboard/identities',
          t: '/dashboard/tiering',
          v: '/dashboard/issues?view=violations',
          a: '/dashboard/ai',
          r: '/dashboard/reports',
          s: '/dashboard/settings',
          h: '/dashboard/threats',
        }

        if (navMap[key]) {
          e.preventDefault()
          navigate(navMap[key])
        }
        return
      }

      // Cmd+B: toggle sidebar
      if (meta && key === 'b') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('toggle-sidebar'))
        return
      }

      // Cmd+/: show shortcuts help
      if (meta && key === '/') {
        e.preventDefault()
        globalSetShowHelp?.(true)
        return
      }

      // ?: show shortcuts help
      if (key === '?' && !meta && !e.shiftKey === false) {
        globalSetShowHelp?.(true)
        return
      }

      // Shift+? (which is actually '?' with shift)
      if (e.key === '?') {
        globalSetShowHelp?.(true)
        return
      }

      // g: start navigation mode
      if (key === 'g' && !meta) {
        waitingForNav.current = true
        navTimeout.current = setTimeout(() => {
          waitingForNav.current = false
        }, 1500)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (navTimeout.current) clearTimeout(navTimeout.current)
    }
  }, [navigate])
}
