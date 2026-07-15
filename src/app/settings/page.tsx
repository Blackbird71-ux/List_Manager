import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isPrimaryOrgAdmin } from '@/lib/access'
import { AppShell } from '@/components/AppShell'
import { SettingsClient } from '@/components/SettingsClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // Instance-wide settings (email, tunnel) belong to the primary organisation.
  const isPrimaryAdmin = await isPrimaryOrgAdmin(session.user.role, session.user.organizationId)

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <SettingsClient
        user={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email ?? '',
          role: session.user.role,
        }}
        isPrimaryAdmin={isPrimaryAdmin}
      />
    </AppShell>
  )
}
