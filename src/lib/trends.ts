import { parseNumber } from '@/lib/item-types'

// Trend aggregation for the reports page. Items are grouped by the template they
// came from (or the list title for one-offs) plus the item text, since every run of
// a template copies the same item text.

export interface TrendItem {
  text: string
  kind: string
  result: string
  value: string
  unit: string
  minValue: number | null
  maxValue: number | null
  checkedAt: Date | null
  actionDueDate: Date | null
  actionClosedAt: Date | null
  source: string
}

export interface CheckStat {
  source: string
  text: string
  checks: number
  fails: number
  failRate: number
}

export interface ReadingStat {
  source: string
  text: string
  unit: string
  minValue: number | null
  maxValue: number | null
  count: number
  outOfRange: number
  low: number
  high: number
  average: number
  // Most recent readings, oldest first, for a sparkline.
  recent: { at: string; value: number; fail: boolean }[]
}

export interface ActionStats {
  openNow: number
  overdueNow: number
  raisedInWindow: number
  closedInWindow: number
  avgDaysToClose: number | null
}

const MAX_RECENT = 30
const round1 = (n: number) => Math.round(n * 10) / 10
const keyOf = (i: { source: string; text: string }) => `${i.source}\u0000${i.text}`

/** Pass/fail checks (inspection results and ranged readings), worst fail rate first. */
export function checkStats(items: TrendItem[], limit = 15): CheckStat[] {
  const groups = new Map<string, CheckStat>()
  for (const i of items) {
    if (i.result !== 'pass' && i.result !== 'fail') continue
    const g = groups.get(keyOf(i)) ?? { source: i.source, text: i.text, checks: 0, fails: 0, failRate: 0 }
    g.checks++
    if (i.result === 'fail') g.fails++
    groups.set(keyOf(i), g)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, failRate: Math.round((g.fails / g.checks) * 100) }))
    .sort((a, b) => b.failRate - a.failRate || b.fails - a.fails || b.checks - a.checks)
    .slice(0, limit)
}

/** Number readings grouped per item, most readings first. */
export function readingStats(items: TrendItem[], limit = 20): ReadingStat[] {
  const groups = new Map<string, { at: Date; value: number; fail: boolean; item: TrendItem }[]>()
  for (const i of items) {
    if (i.kind !== 'number' || !i.checkedAt) continue
    const value = parseNumber(i.value)
    if (value === null) continue
    const points = groups.get(keyOf(i)) ?? []
    points.push({ at: i.checkedAt, value, fail: i.result === 'fail', item: i })
    groups.set(keyOf(i), points)
  }
  return [...groups.values()]
    .map((points) => {
      points.sort((a, b) => a.at.getTime() - b.at.getTime())
      const values = points.map((p) => p.value)
      // The latest reading's unit and range, in case the template was edited.
      const last = points[points.length - 1].item
      return {
        source: last.source,
        text: last.text,
        unit: last.unit,
        minValue: last.minValue,
        maxValue: last.maxValue,
        count: points.length,
        outOfRange: points.filter((p) => p.fail).length,
        low: Math.min(...values),
        high: Math.max(...values),
        average: round1(values.reduce((a, b) => a + b, 0) / values.length),
        recent: points.slice(-MAX_RECENT).map((p) => ({ at: p.at.toISOString(), value: p.value, fail: p.fail })),
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/**
 * Corrective actions. `open` is every currently open action (any age); `recent` is
 * failed items checked or closed since the window start.
 */
export function actionStats(open: TrendItem[], recent: TrendItem[], since: Date, now: Date): ActionStats {
  const raised = recent.filter((i) => i.result === 'fail' && i.checkedAt && i.checkedAt >= since)
  const closed = recent.filter((i) => i.result === 'fail' && i.actionClosedAt && i.actionClosedAt >= since)
  const spans = closed
    .filter((i) => i.checkedAt)
    .map((i) => (i.actionClosedAt as Date).getTime() - (i.checkedAt as Date).getTime())
  return {
    openNow: open.length,
    overdueNow: open.filter((i) => i.actionDueDate && i.actionDueDate < now).length,
    raisedInWindow: raised.length,
    closedInWindow: closed.length,
    avgDaysToClose: spans.length ? round1(spans.reduce((a, b) => a + b, 0) / spans.length / 86400000) : null,
  }
}
