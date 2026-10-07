'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CalendarEvent {
  key: string
  kind: 'list' | 'item'
  title: string
  parent?: string
  checklistId: string
  date: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Month grid of what is due when: whole checklists (solid) and individual items (outlined).
export function CalendarClient({ events }: { events: CalendarEvent[] }) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const k = dayKey(new Date(e.date))
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return map
  }, [events])

  // Monday-first grid covering whole weeks.
  const first = new Date(month)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  const weeks = Math.ceil((offset + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const today = dayKey(new Date())

  function shift(by: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg border border-border p-1.5 hover:bg-hover">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-hover"
          >
            Today
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-lg border border-border p-1.5 hover:bg-hover">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border bg-border gap-px text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-panel px-2 py-1.5 font-medium text-muted">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(dayKey(d)) ?? []
          const inMonth = d.getMonth() === month.getMonth()
          return (
            <div key={d.toISOString()} className={cn('min-h-24 bg-panel p-1.5', !inMonth && 'bg-hover/50 text-faint')}>
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1',
                  dayKey(d) === today && 'bg-accent font-semibold text-accent-ink'
                )}
              >
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 4).map((e) => (
                  <Link
                    key={e.key}
                    href={`/checklists/${e.checklistId}`}
                    title={e.parent ? `${e.title} — ${e.parent}` : e.title}
                    className={cn(
                      'block truncate rounded px-1 py-0.5',
                      e.kind === 'list' ? 'bg-accent-soft text-accent hover:underline' : 'border border-border text-ink hover:bg-hover'
                    )}
                  >
                    {e.title}
                  </Link>
                ))}
                {list.length > 4 && <p className="px-1 text-faint">+{list.length - 4} more</p>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted">Shaded = whole checklist due. Outlined = a single item due. Completed work is not shown.</p>
    </div>
  )
}
