import { NextResponse } from 'next/server'
import { DateTime } from 'luxon'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSeeAllChecklists } from '@/lib/access'
import { APP_TIMEZONE } from '@/lib/timezone'

export const dynamic = 'force-dynamic'

const MAX_TREND_WEEKS = 12

function avgHours(spans: number[]): number | null {
  if (spans.length === 0) return null
  const ms = spans.reduce((a, b) => a + b, 0) / spans.length
  return Math.round((ms / 3600000) * 10) / 10
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
  const [checklists, checkedItems, users] = await Promise.all([
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
  ])

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
    }))
    .sort((a, b) => b.runs - a.runs)

  // Completions per week (app timezone), newest-last, capped at 12 weeks.
  const weeks = Math.min(MAX_TREND_WEEKS, Math.max(1, Math.ceil(days / 7)))
  const thisWeekStart = DateTime.now().setZone(APP_TIMEZONE).startOf('week')
  const trend = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = thisWeekStart.minus({ weeks: i })
    const end = start.plus({ weeks: 1 })
    const count = completed.filter((c) => {
      const t = (c.completedAt as Date).getTime()
      return t >= start.toMillis() && t < end.toMillis()
    }).length
    trend.push({ weekStart: start.toFormat('yyyy-MM-dd'), completedCount: count })
  }

  return NextResponse.json({ totals, byUser, byCategory, byTemplate, trend })
}
