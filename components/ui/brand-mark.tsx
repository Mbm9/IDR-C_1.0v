import { Shield } from 'lucide-react'

/**
 * The organization's logo, or the built-in shield when none is set.
 * Logos are data: URLs rendered through <img>, so SVG scripts never run.
 * The logo is transparent by default; `background` draws it on a white tile
 * for logos that need a light backdrop (e.g. dark artwork on the dark sidebar).
 */
export function BrandMark({ logo, background = false, size = 32, className = '' }: {
  logo?: string | null
  background?: boolean
  size?: number
  className?: string
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing to optimize
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className={`object-contain flex-shrink-0 ${background ? 'rounded-lg bg-white' : ''} ${className}`}
        style={{ width: size, height: size, padding: background ? Math.round(size / 10) : 0 }}
      />
    )
  }
  return (
    <div
      className={`rounded-lg bg-[var(--color-info)] flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Shield size={Math.round(size * 0.56)} className="text-white" aria-hidden="true" />
    </div>
  )
}
