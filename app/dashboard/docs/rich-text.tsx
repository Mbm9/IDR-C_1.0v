import { Fragment } from 'react'

/**
 * Renders documentation text with minimal inline markup:
 * segments wrapped in backticks become LTR-isolated <code> spans, so paths,
 * commands and attribute names keep their left-to-right order inside
 * right-to-left (Arabic) prose. The `dir` attribute on an inline element
 * isolates it from the surrounding bidi context (like <bdi>).
 */
export function RichText({ text }: { text: string }) {
  if (!text.includes('`')) return <>{text}</>

  const parts = text.split('`')
  return (
    <>
      {parts.map((part, i) => {
        // Odd indexes are inside backticks.
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>
        return (
          <code
            key={i}
            dir="ltr"
            className={`rounded font-mono text-[0.95em] ${part.includes('\n') ? 'my-1 block whitespace-pre-wrap p-2' : 'break-words px-1 py-px'}`}
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          >
            {part}
          </code>
        )
      })}
    </>
  )
}
