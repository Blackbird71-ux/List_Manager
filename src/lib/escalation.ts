import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { formatInTz } from '@/lib/timezone'

const KEY = 'escalation'
const DAY_MS = 86_400_000

/** Days overdue before managers are told; 0 means escalation is off. */
export async function getEscalationDays(): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
    const days = row ? Number((JSON.parse(row.value) as { days?: number }).days) : 0
    return Number.isInteger(days) && days > 0 ? days : 0
  } catch {
    return 0
  }
}

export async function saveEscalationDays(days: number) {
  const value = JSON.stringify({ days })
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  })
}

/**
 * Tell each organisation's admins and managers about active lists that have been
 * overdue for the configured number of days. Each list is escalated once
 * (escalatedAt), so running this daily does not repeat itself.
 */
export async function runEscalation(): Promise<{ escalated: number }> {
  const days = await getEscalationDays()
  if (days === 0) return { escalated: 0 }

  const cutoff = new Date(Date.now() - days * DAY_MS)
  const lists = await prisma.checklist.findMany({
    where: { status: 'active', escalatedAt: null, dueDate: { lt: cutoff } },
    select: { id: true, title: true, dueDate: true, organizationId: true },
  })
  if (lists.length === 0) return { escalated: 0 }

  const managers = await prisma.user.findMany({
    where: {
      role: { in: ['admin', 'manager'] },
      organizationId: { in: [...new Set(lists.map((l) => l.organizationId))] },
    },
    select: { id: true, organizationId: true },
  })

  for (const list of lists) {
    const dueText = list.dueDate
      ? formatInTz(list.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })
      : 'earlier'
    for (const manager of managers.filter((m) => m.organizationId === list.organizationId)) {
      await notify(
        manager.id,
        'Escalation: long overdue',
        `"${list.title}" has been overdue for ${days}+ days (due ${dueText}).`,
        list.id,
        { email: true }
      )
    }
    await prisma.checklist.update({ where: { id: list.id }, data: { escalatedAt: new Date() } })
  }
  return { escalated: lists.length }
}
