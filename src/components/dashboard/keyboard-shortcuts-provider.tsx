'use client'

import { useKeyboardShortcuts, useShortcutsHelpState } from '@/lib/hooks/use-keyboard-shortcuts'
import { ShortcutsHelp } from '@/components/dashboard/shortcuts-help'

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts()
  const { showHelp, setShowHelp } = useShortcutsHelpState()

  return (
    <>
      {children}
      <ShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </>
  )
}
