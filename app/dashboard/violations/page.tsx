import { redirect } from 'next/navigation'

// Individual violations are a view of the Issues page; keep the old URL working.
export default function ViolationsPage() {
  redirect('/dashboard/issues?view=violations')
}
