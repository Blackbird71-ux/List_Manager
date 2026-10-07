import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { AppShell } from '@/components/AppShell'
import { CalendarClient } from '@/components/CalendarClient'

// Everything still open that has a due date, for the month grid.
export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const access = checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId)
  const [lists, items] = await Promise.all([
    prisma.checklist.findMany({
      where: { status: 'active', dueDate: { not: null }, ...access },
      select: { id: true, title: true, dueDate: true, priority: true },
    }),
    prisma.checklistItem.findMany({
      where: { checked: false, dueDate: { not: null }, checklist: { status: 'active', ...access } },
      select: { id: true, text: true, dueDate: true, checklist: { select: { id: true, title: true } } },
      take: 2000,
    }),
  ])

  const events = [
    ...lists.map((c) => ({
      key: `c${c.id}`,
      kind: 'list' as const,
      title: c.title,
      checklistId: c.id,
      date: c.dueDate!.toISOString(),
    })),
    ...items.map((i) => ({
      key: `i${i.id}`,
      kind: 'item' as const,
      title: i.text,
      parent: i.checklist.title,
      checklistId: i.checklist.id,
      date: i.dueDate!.toISOString(),
    })),
  ]

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <CalendarClient events={events} />
    </AppShell>
  )
}
