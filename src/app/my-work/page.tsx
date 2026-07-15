import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { AppShell } from '@/components/AppShell'
import { MyWorkClient } from '@/components/MyWorkClient'

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

// Overdue first, then due date ascending (no due date last), then priority.
function compareWork(
  a: { dueDate: Date | null; priority: string | null },
  b: { dueDate: Date | null; priority: string | null }
) {
  const now = Date.now()
  const aOverdue = a.dueDate !== null && a.dueDate.getTime() < now
  const bOverdue = b.dueDate !== null && b.dueDate.getTime() < now
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
  if (a.dueDate && b.dueDate && a.dueDate.getTime() !== b.dueDate.getTime()) {
    return a.dueDate.getTime() - b.dueDate.getTime()
  }
  if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1
  return (
    (a.priority ? PRIORITY_RANK[a.priority] ?? 3 : 3) -
    (b.priority ? PRIORITY_RANK[b.priority] ?? 3 : 3)
  )
}

export default async function MyWorkPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const access = checklistAccessWhere(session.user.id, session.user.role)
  const [items, checklists] = await Promise.all([
    prisma.checklistItem.findMany({
      where: {
        assignedToId: session.user.id,
        checked: false,
        checklist: { status: 'active', ...access },
      },
      select: {
        id: true,
        text: true,
        priority: true,
        dueDate: true,
        checklist: { select: { id: true, title: true } },
      },
    }),
    prisma.checklist.findMany({
      where: { status: 'active', assignedToId: session.user.id, ...access },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        items: { select: { checked: true } },
      },
    }),
  ])

  const myItems = [...items].sort(compareWork).map((i) => ({
    id: i.id,
    text: i.text,
    priority: i.priority,
    dueDate: i.dueDate?.toISOString() ?? null,
    checklist: i.checklist,
  }))
  const myChecklists = [...checklists].sort(compareWork).map((c) => ({
    id: c.id,
    title: c.title,
    priority: c.priority,
    dueDate: c.dueDate?.toISOString() ?? null,
    done: c.items.filter((i) => i.checked).length,
    total: c.items.length,
  }))

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <MyWorkClient items={myItems} checklists={myChecklists} />
    </AppShell>
  )
}
