// Shared attack-path technique mapping.
//
// Maps graph edges to a human-readable attack technique + MITRE ATT&CK id. Used by both
// the on-demand attack-path API (`app/api/attack-paths/route.ts`) and the scheduled
// attack-path scanner (`app/api/cron/attack-path-scanner/route.ts`) — keep the logic here
// so the two stay in sync.

export interface GraphEdge {
  type: string
  label: string
  properties?: Record<string, any>
}

/** Determine the dominant attack technique for a full path (ordered list of edges). */
export function determineTechnique(edges: GraphEdge[]): { name: string; mitreId: string | null } {
  for (const e of edges) {
    const label = (e.label || '').toLowerCase()
    if (label.includes('genericall') || label.includes('generic_all')) return { name: 'AD Object Takeover', mitreId: 'T1222.001' }
    if (label.includes('writedacl') || label.includes('write_dacl')) return { name: 'DACL Modification', mitreId: 'T1222.001' }
    if (label.includes('writeowner') || label.includes('write_owner')) return { name: 'Owner Modification', mitreId: 'T1222.001' }
    if (label.includes('dcsync')) return { name: 'DCSync', mitreId: 'T1003.006' }
    if (label.includes('force_change_password') || label.includes('forcechang')) return { name: 'Forced Password Change', mitreId: 'T1098' }
    if (label.includes('add_member') || label.includes('addmember')) return { name: 'Group Membership Abuse', mitreId: 'T1098.002' }
    if (e.type === 'delegation' && e.properties?.dangerous) return { name: 'Delegation Abuse', mitreId: 'T1134.001' }
    if (label.includes('domain admin') || label.includes('enterprise admin')) return { name: 'Privilege Escalation via Entitlement', mitreId: 'T1078.002' }
  }
  if (edges.some(e => e.type === 'membership')) return { name: 'Group Membership Chain', mitreId: 'T1078.002' }
  if (edges.some(e => e.type === 'owner')) return { name: 'NHI Owner Compromise', mitreId: 'T1078.004' }
  return { name: 'Lateral Movement', mitreId: 'T1021' }
}

/** Short technique label for a single edge. */
export function edgeToTechnique(edge: GraphEdge): string {
  const label = (edge.label || '').toLowerCase()
  if (label.includes('genericall')) return 'GenericAll'
  if (label.includes('writedacl')) return 'WriteDACL'
  if (label.includes('writeowner')) return 'WriteOwner'
  if (label.includes('dcsync')) return 'DCSync'
  if (label.includes('add_member')) return 'AddMember'
  if (label.includes('force_change_password')) return 'ForceChangePassword'
  if (edge.type === 'membership') return 'GroupMembership'
  if (edge.type === 'entitlement') return 'Entitlement'
  if (edge.type === 'owner') return 'OwnerOf'
  if (edge.type === 'delegation') return 'Delegation'
  if (edge.type === 'acl') return 'ACLAbuse'
  return edge.type
}
