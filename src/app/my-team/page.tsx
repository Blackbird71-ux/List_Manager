import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { AppShell } from '@/components/AppShell'
import { MyTeamClient, type MyTeamPerson } from '@/components/MyTeamClient'

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

export default async function MyTeamPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const memberships = await prisma.departmentMember.findMany({
    where: { userId: session.user.id },
    select: { departmentId: true, department: { select: { name: true } } },
  })
  const departmentNames = memberships.map((m) => m.department.name).sort()

  let people: MyTeamPerson[] = []
  if (memberships.length > 0) {
    const colleagues = await prisma.departmentMember.findMany({
      where: { departmentId: { in: memberships.map((m) => m.departmentId) } },
      select: { user: { select: { id: true, name: true } } },
    })
    const byId = new Map(colleagues.map((c) => [c.user.id, c.user]))
    const userIds = Array.from(byId.keys())

    // Only show work the viewer is themselves allowed to see.
    const access = checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId)
    const [items, checklists] = await Promise.all([
      prisma.checklistItem.findMany({
        where: {
          assignedToId: { in: userIds },
          checked: false,
          checklist: { status: 'active', ...access },
        },
        select: {
          id: true,
          text: true,
          priority: true,
          dueDate: true,
          assignedToId: true,
          checklist: { select: { id: true, title: true } },
        },
      }),
      prisma.checklist.findMany({
        where: { status: 'active', assignedToId: { in: userIds }, ...access },
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
          assignedToId: true,
          items: { select: { checked: true } },
        },
      }),
    ])

    people = userIds
      .map((userId) => {
        const user = byId.get(userId)!
        return {
          id: user.id,
          name: user.name,
          isMe: user.id === session.user.id,
          items: items
            .filter((i) => i.assignedToId === userId)
            .sort(compareWork)
            .map((i) => ({
              id: i.id,
              text: i.text,
              priority: i.priority,
              dueDate: i.dueDate?.toISOString() ?? null,
              checklist: i.checklist,
            })),
          checklists: checklists
            .filter((c) => c.assignedToId === userId)
            .sort(compareWork)
            .map((c) => ({
              id: c.id,
              title: c.title,
              priority: c.priority,
              dueDate: c.dueDate?.toISOString() ?? null,
              done: c.items.filter((i) => i.checked).length,
              total: c.items.length,
            })),
        }
      })
      .sort((a, b) => {
        if (a.isMe !== b.isMe) return a.isMe ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <MyTeamClient departmentNames={departmentNames} people={people} />
    </AppShell>
  )
}
