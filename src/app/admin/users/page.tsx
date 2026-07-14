import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { UsersClient } from '@/components/UsersClient'

export default async function UsersPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (session.user.role !== 'admin') redirect('/')

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <UsersClient currentUserId={session.user.id} />
    </AppShell>
  )
}
