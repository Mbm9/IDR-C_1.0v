'use client'

import { HelpCircle } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { GLOSSARY } from '@/lib/glossary'

interface HelpTooltipProps {
  /** Snake_case key into GLOSSARY, e.g. "tier_violation" */
  term: string
  /** Optional override text (falls back to GLOSSARY[term]) */
  text?: string
  /** Size of the icon in px (default 14) */
  size?: number
}

export function HelpTooltip({ term, text, size = 14 }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(true)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const content = text ?? GLOSSARY[term]
  if (!content) return null

  const reposition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // If there is less than 160px above the trigger, show below instead
    setAbove(rect.top > 160)
  }, [])

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  const toggle = () => {
    if (!open) reposition()
    setOpen((v) => !v)
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Help: ${term.replace(/_/g, ' ')}`}
        onClick={toggle}
        onMouseEnter={() => {
          reposition()
          setOpen(true)
        }}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)] transition-colors"
      >
        <HelpCircle size={size} />
      </button>

      {open && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`
            absolute z-50 w-72 px-3 py-2 rounded-lg shadow-lg border
            bg-[var(--bg-primary)] border-[var(--border-default)]
            text-caption text-[var(--text-secondary)] leading-relaxed
            ${above ? 'bottom-full mb-2' : 'top-full mt-2'}
            start-1/2 -translate-x-1/2
          `}
        >
          <span className="font-semibold text-[var(--text-primary)] block mb-0.5">
            {term.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
          {content}
        </div>
      )}
    </span>
  )
}
