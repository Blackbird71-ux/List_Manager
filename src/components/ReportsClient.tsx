'use client'

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    itemsChecked: number
  }[]
  byCategory: {
    category: string
    active: number
    completedInWindow: number
    overdueNow: number
    avgCompletionHours: number | null
  }[]
  byTemplate: { templateTitle: string; runs: number; avgCompletionHours: number | null }[]
  trend: { weekStart: string; completedCount: number }[]
}

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
]

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
    <div className="mx-auto max-w-4xl space-y-4">
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
            {data.trend.every((t) => t.completedCount === 0) ? (
              <p className="text-sm text-faint">No completions in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {data.trend.map((t) => (
                  <div key={t.weekStart} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-faint">{t.weekStart}</span>
                    <div className="h-4 flex-1 rounded bg-hover">
                      <div
                        className="h-4 rounded bg-accent"
                        style={{ width: `${(t.completedCount / maxTrend) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right font-medium">
                      {t.completedCount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                      <th className="pb-2 text-right font-medium">Avg completion</th>
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
                        <td className="py-2 text-right">{hoursLabel(c.avgCompletionHours)}</td>
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
                      <th className="pb-2 text-right font-medium">Avg completion</th>
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
                        <td className="py-2 text-right">{hoursLabel(t.avgCompletionHours)}</td>
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
