import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { TemplatesClient } from '@/components/TemplatesClient'

export default async function TemplatesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <TemplatesClient />
    </AppShell>
  )
}
