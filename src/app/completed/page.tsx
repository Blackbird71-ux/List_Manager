import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { CompletedClient } from '@/components/CompletedClient'

export default async function CompletedPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <CompletedClient />
    </AppShell>
  )
}
