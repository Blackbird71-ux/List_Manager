import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { DashboardClient } from '@/components/DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <DashboardClient currentUserId={session.user.id} />
    </AppShell>
  )
}
