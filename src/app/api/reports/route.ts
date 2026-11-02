import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSeeAllChecklists } from '@/lib/access'
import { weekBoundsInTz, formatInTzPattern } from '@/lib/timezone'
import { OPEN_ACTION } from '@/lib/corrective-actions'
import { actionStats, checkStats, readingStats, type TrendItem } from '@/lib/trends'

export const dynamic = 'force-dynamic'

const MAX_TREND_WEEKS = 12

function avgHours(spans: number[]): number | null {
  if (spans.length === 0) return null
  const ms = spans.reduce((a, b) => a + b, 0) / spans.length
  return Math.round((ms / 3600000) * 10) / 10
}

// Share of finished lists (with a due date) that were completed after it, as a percentage.
function lateRate(done: { completedAt: Date | null; dueDate: Date | null }[]): number | null {
  const dated = done.filter((c) => c.dueDate && c.completedAt)
  if (dated.length === 0) return null
  const late = dated.filter((c) => (c.completedAt as Date) > (c.dueDate as Date)).length
  return Math.round((late / dated.length) * 100)
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canSeeAllChecklists(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 30))
  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const organizationId = session.user.organizationId
  const trendSelect = {
    text: true,
    kind: true,
    result: true,
    value: true,
    unit: true,
    minValue: true,
    maxValue: true,
    checkedAt: true,
    actionDueDate: true,
    actionClosedAt: true,
    checklist: { select: { title: true, template: { select: { title: true } } } },
  } as const
  const [checklists, checkedItems, users, resultItems, openActionItems] = await Promise.all([
    prisma.checklist.findMany({
      where: {
        organizationId,
        OR: [{ status: 'active' }, { status: 'completed', completedAt: { gte: since } }],
      },
      select: {
        status: true,
        category: true,
        createdAt: true,
        completedAt: true,
        dueDate: true,
        assignedToId: true,
        template: { select: { title: true } },
      },
    }),
    prisma.checklistItem.findMany({
      where: { checked: true, checkedAt: { gte: since }, checklist: { organizationId } },
      select: { checkedByName: true },
    }),
    prisma.user.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // Inspection results and readings in the window, plus actions closed in it.
    prisma.checklistItem.findMany({
      where: {
        checklist: { organizationId },
        OR: [
          { checkedAt: { gte: since }, OR: [{ result: { in: ['pass', 'fail'] } }, { kind: 'number' }] },
          { result: 'fail', actionClosedAt: { gte: since } },
        ],
      },
      select: trendSelect,
    }),
    prisma.checklistItem.findMany({
      where: { ...OPEN_ACTION, checklist: { organizationId } },
      select: trendSelect,
    }),
  ])

  // Group items by the template they came from, or the list title for one-offs.
  const toTrendItem = ({ checklist, ...i }: (typeof resultItems)[number]): TrendItem => ({
    ...i,
    source: checklist.template?.title ?? checklist.title,
  })
  const recentItems = resultItems.map(toTrendItem)
  const inWindow = recentItems.filter((i) => i.checkedAt && i.checkedAt >= since)
  const trends = {
    checks: checkStats(inWindow),
    readings: readingStats(inWindow),
    actions: actionStats(openActionItems.map(toTrendItem), recentItems, since, now),
  }

  const active = checklists.filter((c) => c.status === 'active')
  const completed = checklists.filter((c) => c.status === 'completed' && c.completedAt)
  const isOverdue = (c: { dueDate: Date | null }) => c.dueDate !== null && c.dueDate < now
  const completionSpan = (c: { createdAt: Date; completedAt: Date | null }) =>
    (c.completedAt as Date).getTime() - c.createdAt.getTime()

  const totals = {
    activeCount: active.length,
    completedInWindow: completed.length,
    overdueNow: active.filter(isOverdue).length,
    avgCompletionHours: avgHours(completed.map(completionSpan)),
  }

  const checkedByName = new Map<string, number>()
  for (const item of checkedItems) {
    if (!item.checkedByName) continue
    checkedByName.set(item.checkedByName, (checkedByName.get(item.checkedByName) ?? 0) + 1)
  }

  const byUser = users.map((u) => ({
    name: u.name,
    assignedActive: active.filter((c) => c.assignedToId === u.id).length,
    completedInWindow: completed.filter((c) => c.assignedToId === u.id).length,
    lateRate: lateRate(completed.filter((c) => c.assignedToId === u.id)),
    overdueNow: active.filter((c) => c.assignedToId === u.id && isOverdue(c)).length,
    itemsChecked: checkedByName.get(u.name) ?? 0,
  }))

  const categories = Array.from(new Set(checklists.map((c) => c.category))).sort()
  const byCategory = categories.map((category) => {
    const inCat = checklists.filter((c) => c.category === category)
    const catCompleted = inCat.filter((c) => c.status === 'completed' && c.completedAt)
    const catActive = inCat.filter((c) => c.status === 'active')
    return {
      category,
      active: catActive.length,
      completedInWindow: catCompleted.length,
      overdueNow: catActive.filter(isOverdue).length,
      avgCompletionHours: avgHours(catCompleted.map(completionSpan)),
      lateRate: lateRate(catCompleted),
    }
  })

  const templateRuns = new Map<string, number[]>()
  for (const c of completed) {
    if (!c.template) continue
    const spans = templateRuns.get(c.template.title) ?? []
    spans.push(completionSpan(c))
    templateRuns.set(c.template.title, spans)
  }
  const byTemplate = Array.from(templateRuns.entries())
    .map(([templateTitle, spans]) => ({
      templateTitle,
      runs: spans.length,
      avgCompletionHours: avgHours(spans),
      lateRate: lateRate(completed.filter((c) => c.template?.title === templateTitle)),
    }))
    .sort((a, b) => b.runs - a.runs)

  // Completions and failed checks per week (app timezone), newest-last, capped at 12 weeks.
  const weeks = Math.min(MAX_TREND_WEEKS, Math.max(1, Math.ceil(days / 7)))
  const trend = []
  for (let i = weeks - 1; i >= 0; i--) {
    const { start, end } = weekBoundsInTz(i)
    const inWeek = (d: Date) => d >= start && d < end
    const weekDone = completed.filter((c) => inWeek(c.completedAt as Date))
    trend.push({
      weekStart: formatInTzPattern(start, 'yyyy-MM-dd'),
      completedCount: weekDone.length,
      lateRate: lateRate(weekDone),
      failCount: inWindow.filter((i) => i.result === 'fail' && inWeek(i.checkedAt as Date)).length,
    })
  }

  return NextResponse.json({ totals, byUser, byCategory, byTemplate, trend, trends })
}
