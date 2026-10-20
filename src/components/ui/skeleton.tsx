interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--bg-tertiary)] ${className}`}
      style={{ width, height }}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-5" style={{ boxShadow: 'var(--shadow-card)' }}>
      <Skeleton height={12} width={80} className="mb-3" />
      <Skeleton height={32} width={60} />
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              height={16}
              className="flex-1"
              width={j === 0 ? '40%' : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Skeleton shaped like a StatTile (stripe + label + value), matching the real layout. */
export function StatTileSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
      <span className="absolute inset-y-0 start-0 w-[3px] bg-[var(--bg-tertiary)]" />
      <Skeleton height={10} width={90} className="mb-3" />
      <Skeleton height={26} width={52} />
    </div>
  )
}

/** Skeleton that reserves the chart's real height so the layout doesn't jump on load. */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div
      className="flex items-end gap-2 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4"
      style={{ height, boxShadow: 'var(--shadow-card)' }}
    >
      {[40, 65, 50, 80, 55, 72, 48, 90, 60].map((h, i) => (
        <Skeleton key={i} className="flex-1" height={`${h}%`} />
      ))}
    </div>
  )
}
