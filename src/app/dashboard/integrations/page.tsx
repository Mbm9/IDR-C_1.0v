import { redirect } from 'next/navigation'

// Integrations live under Settings; keep the old URL working for links and bookmarks.
export default function IntegrationsPage() {
  redirect('/dashboard/settings?tab=integrations')
}
