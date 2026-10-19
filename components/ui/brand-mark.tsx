import { Shield } from 'lucide-react'

/**
 * The organization's logo, or the built-in shield when none is set.
 * Logos are data: URLs rendered through <img>, so SVG scripts never run.
 */
export function BrandMark({ logo, size = 32, className = '' }: { logo?: string | null; size?: number; className?: string }) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing to optimize
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className={`rounded-lg bg-white object-contain flex-shrink-0 ${className}`}
        style={{ width: size, height: size, padding: Math.round(size / 10) }}
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
