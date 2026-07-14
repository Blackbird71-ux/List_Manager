import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { ChecklistDetailClient } from '@/components/ChecklistDetailClient'

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <ChecklistDetailClient checklistId={id} />
    </AppShell>
  )
}
