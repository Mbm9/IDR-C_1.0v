import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiHandler } from '@/lib/api/handler'
import { simulateRemoval } from '@/lib/graph/analysis'

const bodySchema = z.object({
  removeNodeId: z.string().min(1).optional(),
  removeEdge: z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    label: z.string().optional(),
  }).optional(),
}).refine((v) => !!v.removeNodeId !== !!v.removeEdge, {
  message: 'Provide exactly one of removeNodeId or removeEdge',
})

/** POST /api/graph/simulate — what-if: remove a node/edge, report Tier 0 attack-path delta. */
export const POST = withApiHandler(async (req: NextRequest, { orgId, log }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const result = await simulateRemoval(orgId, parsed.data)
  log.info('What-if simulation', { kind: result.kind, pathsBroken: result.pathsBroken })
  return NextResponse.json(result)
}, { requiredRole: 'analyst' })
