import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { formatInTz } from '@/lib/timezone'

const DEDUPE_HOURS = 20

/**
 * Notify assignees (or creators, when unassigned) of overdue active
 * checklists, then send admins/managers a team-wide summary. Notifications
 * are deduped so re-running within 20 hours does not spam anyone.
 * Returns { notified: notifications created, overdue: overdue checklists }.
 */
export async function runOverdueDigest(): Promise<{ notified: number; overdue: number }> {
  const now = new Date()
  const dedupeCutoff = new Date(now.getTime() - DEDUPE_HOURS * 60 * 60 * 1000)

  const overdue = await prisma.checklist.findMany({
    where: { status: 'active', dueDate: { lt: now } },
    select: { id: true, title: true, dueDate: true, assignedToId: true, createdById: true },
  })

  let notified = 0

  if (overdue.length > 0) {
    // Existing per-checklist notifications inside the dedupe window.
    const recent = await prisma.notification.findMany({
      where: {
        title: 'Overdue checklist',
        checklistId: { in: overdue.map((c) => c.id) },
        createdAt: { gte: dedupeCutoff },
      },
      select: { userId: true, checklistId: true },
    })
    const alreadySent = new Set(recent.map((n) => `${n.userId}:${n.checklistId}`))

    for (const checklist of overdue) {
      const targetId = checklist.assignedToId ?? checklist.createdById
      if (alreadySent.has(`${targetId}:${checklist.id}`)) continue
      const dueText = checklist.dueDate
        ? formatInTz(checklist.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })
        : 'earlier'
      await notify(
        targetId,
        'Overdue checklist',
        `"${checklist.title}" was due ${dueText}.`,
        checklist.id
      )
      notified++
    }

    // Team-wide summary for every admin/manager, same dedupe window.
    const managers = await prisma.user.findMany({
      where: { role: { in: ['admin', 'manager'] } },
      select: { id: true },
    })
    const recentDigests = await prisma.notification.findMany({
      where: {
        title: 'Overdue digest',
        userId: { in: managers.map((m) => m.id) },
        checklistId: null,
        createdAt: { gte: dedupeCutoff },
      },
      select: { userId: true },
    })
    const digestSent = new Set(recentDigests.map((n) => n.userId))
    const count = overdue.length
    const body = `${count} checklist${count === 1 ? ' is' : 's are'} overdue across the team.`

    for (const manager of managers) {
      if (digestSent.has(manager.id)) continue
      await notify(manager.id, 'Overdue digest', body)
      notified++
    }
  }

  return { notified, overdue: overdue.length }
}
