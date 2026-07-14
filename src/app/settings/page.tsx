import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { SettingsClient } from '@/components/SettingsClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <SettingsClient
        user={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email ?? '',
          role: session.user.role,
        }}
      />
    </AppShell>
  )
}
