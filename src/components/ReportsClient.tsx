'use client'

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActionStats, CheckStat, ReadingStat } from '@/lib/trends'

interface ReportData {
  totals: {
    activeCount: number
    completedInWindow: number
    overdueNow: number
    avgCompletionHours: number | null
  }
  byUser: {
    name: string
    assignedActive: number
    completedInWindow: number
    overdueNow: number
    lateRate: number | null
    itemsChecked: number
  }[]
  byCategory: {
    category: string
    active: number
    completedInWindow: number
    overdueNow: number
    avgCompletionHours: number | null
    lateRate: number | null
  }[]
  byTemplate: {
    templateTitle: string
    runs: number
    avgCompletionHours: number | null
    lateRate: number | null
  }[]
  trend: { weekStart: string; completedCount: number; lateRate: number | null; failCount: number }[]
  trends: { checks: CheckStat[]; readings: ReadingStat[]; actions: ActionStats }
}

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
]

const pct = (n: number | null) => (n === null ? '—' : `${n}%`)

function rangeLabel(r: { minValue: number | null; maxValue: number | null; unit: string }) {
  const u = r.unit ? ` ${r.unit}` : ''
  if (r.minValue !== null && r.maxValue !== null) return `${r.minValue} to ${r.maxValue}${u}`
  if (r.minValue !== null) return `≥ ${r.minValue}${u}`
  if (r.maxValue !== null) return `≤ ${r.maxValue}${u}`
  return 'No range'
}

function hoursLabel(h: number | null) {
  if (h === null) return '—'
  if (h >= 48) return `${Math.round(h / 24)} days`
  return `${h} hrs`
}

export function ReportsClient() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/reports?days=${days}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const maxTrend = data ? Math.max(1, ...data.trend.map((t) => t.completedCount)) : 1

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <BarChart3 className="h-5 w-5 text-accent" /> Team reports
        </h1>
        <div className="flex gap-1 rounded-lg border border-border bg-panel p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium',
                days === w.days ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-hover'
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="py-12 text-center text-sm text-faint">Loading…</p>}
      {!loading && !data && (
        <p className="py-12 text-center text-sm text-faint">Could not load reports.</p>
      )}

      {!loading && data && (
        <>
          {/* Stat cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Active checklists" value={String(data.totals.activeCount)} />
            <StatCard
              label={`Completed (last ${days}d)`}
              value={String(data.totals.completedInWindow)}
            />
            <StatCard
              label="Overdue now"
              value={String(data.totals.overdueNow)}
              danger={data.totals.overdueNow > 0}
            />
            <StatCard
              label="Avg time to complete"
              value={hoursLabel(data.totals.avgCompletionHours)}
            />
          </div>

          {/* Weekly trend */}
          <div className="rounded-xl border border-border bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">Completions per week</h2>
            {data.trend.every((t) => t.completedCount === 0 && t.failCount === 0) ? (
              <p className="text-sm text-faint">No completions in this period.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="w-20 shrink-0">Week of</span>
                  <span className="flex-1">Completed</span>
                  <span className="w-14 shrink-0 text-right" title="Lists with a due date finished after it">
                    Late
                  </span>
                  <span className="w-14 shrink-0 text-right" title="Checks marked Fail or readings out of range">
                    Failed
                  </span>
                </div>
                {data.trend.map((t) => (
                  <div key={t.weekStart} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-faint">{t.weekStart}</span>
                    <div className="flex flex-1 items-center gap-2">
                      <div className="h-4 flex-1 rounded bg-hover">
                        <div
                          className="h-4 rounded bg-accent"
                          style={{ width: `${(t.completedCount / maxTrend) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right font-medium">{t.completedCount}</span>
                    </div>
                    <span className="w-14 shrink-0 text-right">{pct(t.lateRate)}</span>
                    <span className={cn('w-14 shrink-0 text-right', t.failCount > 0 && 'font-semibold text-danger')}>
                      {t.failCount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ActionsPanel actions={data.trends.actions} />
          <ChecksPanel checks={data.trends.checks} />
          <ReadingsPanel readings={data.trends.readings} />

          {/* By user */}
          <div className="rounded-xl border border-border bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">By person</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-left text-xs text-muted">
                    <th className="pb-2 pr-3 font-medium">Person</th>
                    <th className="pb-2 pr-3 text-right font-medium">Assigned active</th>
                    <th className="pb-2 pr-3 text-right font-medium">Completed</th>
                    <th className="pb-2 pr-3 text-right font-medium">Overdue</th>
                    <th className="pb-2 pr-3 text-right font-medium">Finished late</th>
                    <th className="pb-2 text-right font-medium">Items ticked</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byUser.map((u) => (
                    <tr key={u.name} className="border-b border-border-soft last:border-0">
                      <td className="py-2 pr-3">{u.name}</td>
                      <td className="py-2 pr-3 text-right">{u.assignedActive}</td>
                      <td className="py-2 pr-3 text-right">{u.completedInWindow}</td>
                      <td
                        className={cn(
                          'py-2 pr-3 text-right',
                          u.overdueNow > 0 && 'font-semibold text-danger'
                        )}
                      >
                        {u.overdueNow}
                      </td>
                      <td className="py-2 pr-3 text-right">{u.lateRate === null ? '—' : `${u.lateRate}%`}</td>
                      <td className="py-2 text-right">{u.itemsChecked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* By category */}
          <div className="rounded-xl border border-border bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">By category</h2>
            {data.byCategory.length === 0 ? (
              <p className="text-sm text-faint">No checklists yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-left text-xs text-muted">
                      <th className="pb-2 pr-3 font-medium">Category</th>
                      <th className="pb-2 pr-3 text-right font-medium">Active</th>
                      <th className="pb-2 pr-3 text-right font-medium">Completed</th>
                      <th className="pb-2 pr-3 text-right font-medium">Overdue</th>
                      <th className="pb-2 pr-3 text-right font-medium">Avg completion</th>
                      <th className="pb-2 text-right font-medium">Finished late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((c) => (
                      <tr key={c.category} className="border-b border-border-soft last:border-0">
                        <td className="py-2 pr-3">{c.category}</td>
                        <td className="py-2 pr-3 text-right">{c.active}</td>
                        <td className="py-2 pr-3 text-right">{c.completedInWindow}</td>
                        <td
                          className={cn(
                            'py-2 pr-3 text-right',
                            c.overdueNow > 0 && 'font-semibold text-danger'
                          )}
                        >
                          {c.overdueNow}
                        </td>
                        <td className="py-2 pr-3 text-right">{hoursLabel(c.avgCompletionHours)}</td>
                        <td className="py-2 text-right">{pct(c.lateRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* By template */}
          <div className="rounded-xl border border-border bg-panel p-5">
            <h2 className="mb-3 text-sm font-semibold">Template runs (completed in window)</h2>
            {data.byTemplate.length === 0 ? (
              <p className="text-sm text-faint">No template-based completions in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-left text-xs text-muted">
                      <th className="pb-2 pr-3 font-medium">Template</th>
                      <th className="pb-2 pr-3 text-right font-medium">Runs</th>
                      <th className="pb-2 pr-3 text-right font-medium">Avg completion</th>
                      <th className="pb-2 text-right font-medium">Finished late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTemplate.map((t) => (
                      <tr
                        key={t.templateTitle}
                        className="border-b border-border-soft last:border-0"
                      >
                        <td className="py-2 pr-3">{t.templateTitle}</td>
                        <td className="py-2 pr-3 text-right">{t.runs}</td>
                        <td className="py-2 pr-3 text-right">{hoursLabel(t.avgCompletionHours)}</td>
                        <td className="py-2 text-right">{t.lateRate === null ? '—' : `${t.lateRate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ActionsPanel({ actions }: { actions: ActionStats }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold">Corrective actions</h2>
      <p className="mb-3 text-xs text-muted">Raised when a check fails; closed with a note once it&apos;s fixed.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MiniStat label="Open now" value={String(actions.openNow)} danger={actions.openNow > 0} />
        <MiniStat label="Overdue now" value={String(actions.overdueNow)} danger={actions.overdueNow > 0} />
        <MiniStat label="Raised in period" value={String(actions.raisedInWindow)} />
        <MiniStat label="Closed in period" value={String(actions.closedInWindow)} />
        <MiniStat
          label="Avg time to close"
          value={actions.avgDaysToClose === null ? '—' : `${actions.avgDaysToClose} days`}
        />
      </div>
    </div>
  )
}

function ChecksPanel({ checks }: { checks: CheckStat[] }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold">Checks that fail most</h2>
      <p className="mb-3 text-xs text-muted">Items marked Pass or Fail, and readings checked against a range, worst first.</p>
      {checks.length === 0 ? (
        <p className="text-sm text-faint">
          No pass/fail checks recorded in this period. Mark items Pass or Fail on a checklist, or give a number item
          an OK range, to track them here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-left text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">Check</th>
                <th className="pb-2 pr-3 text-right font-medium">Checked</th>
                <th className="pb-2 pr-3 text-right font-medium">Failed</th>
                <th className="pb-2 text-right font-medium">Fail rate</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.source + c.text} className="border-b border-border-soft last:border-0">
                  <td className="py-2 pr-3">
                    {c.text}
                    <span className="block text-xs text-faint">{c.source}</span>
                  </td>
                  <td className="py-2 pr-3 text-right">{c.checks}</td>
                  <td className={cn('py-2 pr-3 text-right', c.fails > 0 && 'font-semibold text-danger')}>{c.fails}</td>
                  <td className="py-2 text-right">{c.failRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ReadingsPanel({ readings }: { readings: ReadingStat[] }) {
  if (readings.length === 0) return null
  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold">Readings</h2>
      <p className="mb-3 text-xs text-muted">
        Number items over the period. The shaded band is the allowed range; red dots are out of range.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft text-left text-xs text-muted">
              <th className="pb-2 pr-3 font-medium">Reading</th>
              <th className="pb-2 pr-3 font-medium">Recent</th>
              <th className="pb-2 pr-3 text-right font-medium">Count</th>
              <th className="pb-2 pr-3 text-right font-medium">Low</th>
              <th className="pb-2 pr-3 text-right font-medium">Avg</th>
              <th className="pb-2 pr-3 text-right font-medium">High</th>
              <th className="pb-2 text-right font-medium">Out of range</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r) => (
              <tr key={r.source + r.text} className="border-b border-border-soft last:border-0">
                <td className="py-2 pr-3">
                  {r.text}
                  <span className="block text-xs text-faint">
                    {r.source} · {rangeLabel(r)}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Sparkline reading={r} />
                </td>
                <td className="py-2 pr-3 text-right">{r.count}</td>
                <td className="py-2 pr-3 text-right">{r.low}</td>
                <td className="py-2 pr-3 text-right">{r.average}</td>
                <td className="py-2 pr-3 text-right">{r.high}</td>
                <td className={cn('py-2 text-right', r.outOfRange > 0 && 'font-semibold text-danger')}>
                  {r.outOfRange}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const SPARK_W = 140
const SPARK_H = 36
const SPARK_PAD = 4

// One reading's recent values as a line, with its allowed range as a neutral band.
function Sparkline({ reading }: { reading: ReadingStat }) {
  const pts = reading.recent
  const values = pts.map((p) => p.value)
  const bounds = [...values, reading.minValue, reading.maxValue].filter((v): v is number => v !== null)
  let lo = Math.min(...bounds)
  let hi = Math.max(...bounds)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const x = (i: number) => SPARK_PAD + (pts.length === 1 ? (SPARK_W - 2 * SPARK_PAD) / 2 : (i / (pts.length - 1)) * (SPARK_W - 2 * SPARK_PAD))
  const y = (v: number) => SPARK_PAD + ((hi - v) / (hi - lo)) * (SPARK_H - 2 * SPARK_PAD)
  const bandTop = y(reading.maxValue ?? hi)
  const bandBottom = y(reading.minValue ?? lo)
  const unit = reading.unit ? ` ${reading.unit}` : ''
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label={`${pts.length} recent readings of ${reading.text}`}
      className="block"
    >
      {(reading.minValue !== null || reading.maxValue !== null) && (
        <rect x={0} y={bandTop} width={SPARK_W} height={Math.max(1, bandBottom - bandTop)} className="fill-hover" />
      )}
      {pts.length > 1 && (
        <polyline
          points={pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-accent"
        />
      )}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r={p.fail ? 3 : pts.length === 1 ? 2.5 : 6}
          className={p.fail ? 'fill-danger' : pts.length === 1 ? 'fill-accent' : 'fill-transparent'}
        >
          <title>{`${fmt(p.at)}: ${p.value}${unit}${p.fail ? ' (out of range)' : ''}`}</title>
        </circle>
      ))}
    </svg>
  )
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border-soft p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold', danger && 'text-danger')}>{value}</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  danger,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', danger && 'text-danger')}>{value}</p>
    </div>
  )
}
