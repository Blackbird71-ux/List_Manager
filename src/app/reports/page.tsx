import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canSeeAllChecklists } from '@/lib/access'
import { AppShell } from '@/components/AppShell'
import { ReportsClient } from '@/components/ReportsClient'

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!canSeeAllChecklists(session.user.role)) redirect('/')

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <ReportsClient />
    </AppShell>
  )
}
