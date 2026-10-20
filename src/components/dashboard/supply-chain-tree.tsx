'use client'

import { useRef, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isControlPlaneTier } from '@/lib/utils/tiers'

interface NhiDetail {
  nhi: { id: string; name: string; subType: string; status: string; tier: string; expiryAt?: string }
  resources: { id: string; name: string; type: string; tier: string; criticality: string; permission: string }[]
  downstreamNhis: { id: string; displayName: string; subType: string }[]
  credentialAge: number | null
  criticality: string
}

interface Props {
  owner: { id: string; name: string; type: string; subType: string; tier: string; department: string }
  ownedNhis: NhiDetail[]
}

export function SupplyChainTree({ owner, ownedNhis }: Props) {
  const t = useTranslations('supplyChain')
  const tTiers = useTranslations('tiers')
  const tId = useTranslations('identity')
  const tSev = useTranslations('severity')
  const tStatus = useTranslations('status')
  const tr = (fn: ReturnType<typeof useTranslations>, v: string | null | undefined) => {
    const s = String(v ?? '')
    return s && fn.has(s) ? fn(s) : s.replace(/_/g, ' ')
  }
  const L = {
    type: t('treeType'), tier: t('treeTier'), dept: t('treeDept'), status: t('treeStatus'),
    criticality: t('treeCriticality'), resources: t('treeResources'), permission: t('treePermission'),
    na: t('treeNa'), owner: t('legendOwner'), nhi: t('legendNhi'), critical: t('legendCritical'), resource: t('legendResource'),
  }
  const credAge = (days: number) => t('treeCredentialAge', { days })
  const moreRes = (n: number) => t('treeMore', { count: n })
  const labelsKey = JSON.stringify(L)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string[] } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      const height = Math.max(400, ownedNhis.length * 80 + 100)
      setDimensions({ width, height: Math.min(800, height) })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [ownedNhis.length])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = dimensions
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const rootX = 80
    const rootY = height / 2
    const nhiX = 280
    const resX = 500

    // Store positions for tooltips
    const hitAreas: { x: number; y: number; r: number; text: string[] }[] = []

    // Draw root (owner)
    ctx.beginPath()
    ctx.arc(rootX, rootY, 18, 0, Math.PI * 2)
    ctx.fillStyle = '#3b82f6'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const ownerShort = owner.name.length > 12 ? owner.name.slice(0, 12) + '..' : owner.name
    ctx.fillText(ownerShort, rootX, rootY)

    hitAreas.push({
      x: rootX, y: rootY, r: 18,
      text: [owner.name, `${L.type}: ${tr(tId, owner.type)}`, `${L.tier}: ${tr(tTiers, owner.tier)}`, `${L.dept}: ${owner.department || L.na}`],
    })

    // Draw NHIs
    const nhiSpacing = Math.min(80, (height - 60) / Math.max(ownedNhis.length, 1))
    const nhiStartY = rootY - ((ownedNhis.length - 1) * nhiSpacing) / 2

    ownedNhis.forEach((detail, idx) => {
      const nhiY = nhiStartY + idx * nhiSpacing
      const isCritical = detail.criticality === 'critical'
      const nodeColor = isCritical ? '#ef4444' : '#8b5cf6'

      // Line from root to NHI
      ctx.beginPath()
      ctx.moveTo(rootX + 18, rootY)
      ctx.bezierCurveTo(rootX + 100, rootY, nhiX - 100, nhiY, nhiX - 12, nhiY)
      ctx.strokeStyle = isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(139, 92, 246, 0.3)'
      ctx.lineWidth = isCritical ? 2 : 1
      ctx.stroke()

      // NHI node
      ctx.beginPath()
      ctx.arc(nhiX, nhiY, 12, 0, Math.PI * 2)
      ctx.fillStyle = nodeColor
      ctx.fill()

      if (isCritical) {
        ctx.beginPath()
        ctx.arc(nhiX, nhiY, 15, 0, Math.PI * 2)
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // NHI label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'start'
      const nhiShort = detail.nhi.name.length > 20 ? detail.nhi.name.slice(0, 20) + '..' : detail.nhi.name
      ctx.fillText(nhiShort, nhiX + 18, nhiY + 3)

      hitAreas.push({
        x: nhiX, y: nhiY, r: 12,
        text: [
          detail.nhi.name,
          `${L.type}: ${tr(tId, detail.nhi.subType)}`,
          `${L.tier}: ${tr(tTiers, detail.nhi.tier)}`,
          `${L.status}: ${tr(tStatus, detail.nhi.status)}`,
          `${L.criticality}: ${tr(tSev, detail.criticality)}`,
          detail.credentialAge !== null ? credAge(detail.credentialAge) : '',
          `${L.resources}: ${detail.resources.length}`,
        ].filter(Boolean),
      })

      // Draw resources (max 3 per NHI to avoid clutter)
      const resPerNhi = detail.resources.slice(0, 3)
      const resSpacing = 22
      const resStartY = nhiY - ((resPerNhi.length - 1) * resSpacing) / 2

      resPerNhi.forEach((res, rIdx) => {
        const resY = resStartY + rIdx * resSpacing
        const resIsCrit = isControlPlaneTier(res.tier) || res.criticality === 'critical'

        // Line from NHI to resource
        ctx.beginPath()
        ctx.moveTo(nhiX + 12, nhiY)
        ctx.lineTo(resX - 5, resY)
        ctx.strokeStyle = resIsCrit ? 'rgba(239, 68, 68, 0.3)' : 'rgba(107, 114, 128, 0.2)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Resource node
        ctx.beginPath()
        ctx.rect(resX - 5, resY - 5, 10, 10)
        ctx.fillStyle = resIsCrit ? '#ef4444' : '#6b7280'
        ctx.fill()

        // Resource label
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)'
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'start'
        const resShort = res.name.length > 18 ? res.name.slice(0, 18) + '..' : res.name
        ctx.fillText(resShort, resX + 10, resY + 3)

        hitAreas.push({
          x: resX, y: resY, r: 8,
          text: [res.name, `${L.type}: ${String(res.type).replace(/_/g, ' ')}`, `${L.tier}: ${tr(tTiers, res.tier)}`, `${L.criticality}: ${tr(tSev, res.criticality)}`, `${L.permission}: ${res.permission}`],
        })
      })

      if (detail.resources.length > 3) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'
        ctx.font = '9px sans-serif'
        ctx.fillText(moreRes(detail.resources.length - 3), resX + 10, resStartY + resPerNhi.length * resSpacing + 3)
      }
    })

    // Legend
    const legendY = height - 30
    const legends = [
      { color: '#3b82f6', shape: 'circle', label: L.owner },
      { color: '#8b5cf6', shape: 'circle', label: L.nhi },
      { color: '#ef4444', shape: 'circle', label: L.critical },
      { color: '#6b7280', shape: 'rect', label: L.resource },
    ]
    legends.forEach((leg, idx) => {
      const lx = 16 + idx * 100
      if (leg.shape === 'circle') {
        ctx.beginPath()
        ctx.arc(lx, legendY, 5, 0, Math.PI * 2)
        ctx.fillStyle = leg.color
        ctx.fill()
      } else {
        ctx.fillStyle = leg.color
        ctx.fillRect(lx - 5, legendY - 5, 10, 10)
      }
      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'start'
      ctx.fillText(leg.label, lx + 10, legendY + 3)
    })

    // Mouse handler
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      for (const area of hitAreas) {
        const dx = mx - area.x
        const dy = my - area.y
        if (dx * dx + dy * dy <= area.r * area.r * 4) {
          setTooltip({ x: mx, y: my, text: area.text })
          return
        }
      }
      setTooltip(null)
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    return () => canvas.removeEventListener('mousemove', handleMouseMove)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, ownedNhis, dimensions, labelsKey])

  if (ownedNhis.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-secondary)]">
        {t('noOwnedNhis')}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t('treeAria', { owner: owner.name, count: ownedNhis.length })}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="w-full"
      />
      {/* Text alternative for the canvas diagram */}
      <ul className="sr-only">
        {ownedNhis.map((d) => (
          <li key={d.nhi.id}>{d.nhi.name}: {d.resources.map((r) => r.name).join(', ')}</li>
        ))}
      </ul>
      {tooltip && (
        <div
          className="absolute bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg shadow-lg p-3 pointer-events-none z-10"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10, maxWidth: 250 }}
        >
          {tooltip.text.map((line, i) => (
            <p key={i} className={`text-xs ${i === 0 ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
