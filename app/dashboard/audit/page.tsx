import { redirect } from 'next/navigation'

// The audit trail lives under Settings; keep the old URL working for links and bookmarks.
export default function AuditPage() {
  redirect('/dashboard/settings?tab=audit-trail')
}
