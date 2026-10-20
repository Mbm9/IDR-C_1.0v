import { Bot, Key, Shield, Server, FileKey, Cpu } from 'lucide-react'

interface IdentityAvatarProps {
  name: string
  type: 'human' | 'non_human'
  subType?: string
  status?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = { sm: 32, md: 40, lg: 56 }
const ICON_SIZES = { sm: 14, md: 18, lg: 24 }

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--color-low)',
  inactive: 'var(--text-tertiary)',
  disabled: 'var(--color-critical)',
  dormant: 'var(--color-medium)',
  orphaned: 'var(--color-critical)',
  suspended: 'var(--color-high)',
}

const NHI_ICONS: Record<string, typeof Bot> = {
  service_account: Server,
  managed_identity: Shield,
  app_registration: FileKey,
  api_key: Key,
  bot: Bot,
  machine: Cpu,
  certificate: FileKey,
}

function getInitials(name: string): string {
  return name
    .split(/[\s\-_.]/)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '')
    .join('')
}

export function IdentityAvatar({ name, type, subType, status, size = 'md' }: IdentityAvatarProps) {
  const dim = SIZES[size]
  const iconSize = ICON_SIZES[size]
  const statusColor = status ? STATUS_COLORS[status] : undefined
  const isHuman = type === 'human'

  const Icon = isHuman ? null : (subType && NHI_ICONS[subType]) || Bot

  return (
    <div className="relative inline-flex shrink-0" style={{ width: dim, height: dim }}>
      {isHuman ? (
        <div
          className="flex items-center justify-center rounded-full font-medium text-white"
          style={{
            width: dim,
            height: dim,
            backgroundColor: 'var(--color-human)',
            fontSize: size === 'lg' ? '1.125rem' : size === 'md' ? '0.875rem' : '0.75rem',
          }}
        >
          {getInitials(name)}
        </div>
      ) : (
        <div
          className="flex items-center justify-center text-white"
          style={{
            width: dim,
            height: dim,
            backgroundColor: 'var(--color-nhi)',
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }}
        >
          {Icon && <Icon size={iconSize} />}
        </div>
      )}

      {/* Status dot */}
      {statusColor && (
        <span
          className={`absolute rounded-full border-2 border-[var(--bg-primary)] ${isHuman ? 'bottom-0 end-0' : 'bottom-[2px] end-[2px]'}`}
          style={{
            width: size === 'lg' ? 14 : size === 'md' ? 12 : 10,
            height: size === 'lg' ? 14 : size === 'md' ? 12 : 10,
            backgroundColor: statusColor,
          }}
        />
      )}
    </div>
  )
}
