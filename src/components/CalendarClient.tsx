'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/calendar'

type View = 'month' | 'week' | 'agenda'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const VIEW_KEY = 'calendar-view'
const PROJECTED_KEY = 'calendar-show-projected'
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7))
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// What is due when: whole checklists (solid), single items (outlined) and the
// forecast runs of recurring lists (dashed). Lists and items can be dragged to
// another day to change their due date.
export function CalendarClient({ events: initial }: { events: CalendarEvent[] }) {
  const router = useRouter()
  const [events, setEvents] = useState(initial)
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [showProjected, setShowProjected] = useState(true)
  const [agendaDays, setAgendaDays] = useState(30)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => setEvents(initial), [initial])

  // Remembered view, else agenda on a phone-sized screen.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY) as View | null
      if (saved === 'month' || saved === 'week' || saved === 'agenda') setView(saved)
      else if (window.matchMedia('(max-width: 640px)').matches) setView('agenda')
      if (localStorage.getItem(PROJECTED_KEY) === '0') setShowProjected(false)
    } catch {}
  }, [])

  function chooseView(v: View) {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {}
  }

  function toggleProjected() {
    setShowProjected(!showProjected)
    try {
      localStorage.setItem(PROJECTED_KEY, showProjected ? '0' : '1')
    } catch {}
  }

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    const order = { list: 0, action: 1, item: 2, projected: 3 }
    for (const e of events) {
      if (e.kind === 'projected' && !showProjected) continue
      const k = dayKey(new Date(e.date))
      map.set(k, [...(map.get(k) ?? []), e])
    }
    for (const list of map.values()) list.sort((a, b) => order[a.kind] - order[b.kind])
    return map
  }, [events, showProjected])

  const today = startOfDay(new Date())
  const todayKey = dayKey(today)

  /** Move a list's, item's or corrective action's due date to `day`, keeping its time of day. */
  async function move(key: string, day: Date) {
    const ev = events.find((e) => e.key === key)
    if (!ev || ev.kind === 'projected') return
    const old = new Date(ev.date)
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes())
    if (dayKey(next) === dayKey(old)) return
    setError('')
    setEvents((all) => all.map((e) => (e.key === key ? { ...e, date: next.toISOString() } : e)))
    const id = key.slice(1)
    const res = await fetch(
      ev.kind === 'list' ? `/api/checklists/${id}` : `/api/checklists/${ev.checklistId}/items/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // A dragged item gets a fixed date, no longer tied to the list's due date.
        body: JSON.stringify(
          ev.kind === 'list'
            ? { dueDate: next.toISOString() }
            : ev.kind === 'action'
              ? { actionDueDate: next.toISOString() }
              : { dueDate: next.toISOString(), dueOffsetDays: null }
        ),
      }
    ).catch(() => null)
    if (!res?.ok) {
      setEvents((all) => all.map((e) => (e.key === key ? { ...e, date: ev.date } : e)))
      setError(`Could not move "${ev.title}".`)
      return
    }
    router.refresh() // recompute forecast runs from the new date
  }

  function shift(by: number) {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + by, 1))
    else setCursor(addDays(cursor, by * 7))
  }

  const heading =
    view === 'month'
      ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `Week of ${mondayOf(cursor).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : 'Agenda'

  function dayCell(d: Date, opts: { dim?: boolean; limit?: number; tall?: boolean }) {
    const list = byDay.get(dayKey(d)) ?? []
    const shown = opts.limit ? list.slice(0, opts.limit) : list
    return (
      <div
        key={d.toISOString()}
        onDragOver={(e) => dragKey && e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (dragKey) move(dragKey, d)
          setDragKey(null)
        }}
        className={cn('bg-panel p-1.5', opts.tall ? 'min-h-48' : 'min-h-24', opts.dim && 'bg-hover/50 text-faint')}
      >
        <span
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1',
            dayKey(d) === todayKey && 'bg-accent font-semibold text-accent-ink'
          )}
        >
          {opts.tall ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) : d.getDate()}
        </span>
        <div className="mt-1 space-y-0.5">
          {shown.map((e) => (
            <EventChip key={e.key} event={e} overdue={startOfDay(new Date(e.date)) < today} onDragStart={setDragKey} onDragEnd={() => setDragKey(null)} />
          ))}
          {list.length > shown.length && (
            <button
              type="button"
              onClick={() => {
                setCursor(d)
                chooseView('week')
              }}
              className="px-1 text-faint hover:underline"
            >
              +{list.length - shown.length} more
            </button>
          )}
        </div>
      </div>
    )
  }

  let body: React.ReactNode
  if (view === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = mondayOf(first)
    const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7)
    const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
    body = (
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border bg-border gap-px text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-panel px-2 py-1.5 font-medium text-muted">
            {d}
          </div>
        ))}
        {days.map((d) => dayCell(d, { dim: d.getMonth() !== cursor.getMonth(), limit: 4 }))}
      </div>
    )
  } else if (view === 'week') {
    const start = mondayOf(cursor)
    body = (
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-border gap-px text-xs sm:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => dayCell(addDays(start, i), { tall: true }))}
      </div>
    )
  } else {
    const overdue = events
      .filter((e) => e.kind !== 'projected' && startOfDay(new Date(e.date)) < today)
      .sort((a, b) => a.date.localeCompare(b.date))
    const days = Array.from({ length: agendaDays }, (_, i) => addDays(today, i)).filter((d) => byDay.has(dayKey(d)))
    body = (
      <div className="space-y-4">
        {overdue.length > 0 && (
          <AgendaGroup label="Overdue" danger events={overdue} onMove={move} />
        )}
        {days.map((d) => (
          <AgendaGroup
            key={d.toISOString()}
            label={dayKey(d) === todayKey ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            events={byDay.get(dayKey(d))!}
            onMove={move}
          />
        ))}
        {overdue.length === 0 && days.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            Nothing due in the next {agendaDays} days. Give a checklist a due date and it will show up here.
          </p>
        )}
        <button
          type="button"
          onClick={() => setAgendaDays(agendaDays + 30)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-hover"
        >
          Show the next 30 days
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{heading}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <div className="mr-2 flex overflow-hidden rounded-lg border border-border text-sm" role="tablist">
            {(['month', 'week', 'agenda'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => chooseView(v)}
                className={cn('px-3 py-1.5 capitalize', view === v ? 'bg-accent text-accent-ink' : 'hover:bg-hover')}
              >
                {v}
              </button>
            ))}
          </div>
          {view !== 'agenda' && (
            <>
              <button type="button" onClick={() => shift(-1)} aria-label={`Previous ${view}`} className="rounded-lg border border-border p-1.5 hover:bg-hover">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCursor(view === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : today)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-hover"
              >
                Today
              </button>
              <button type="button" onClick={() => shift(1)} aria-label={`Next ${view}`} className="rounded-lg border border-border p-1.5 hover:bg-hover">
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {body}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showProjected} onChange={toggleProjected} />
          Show upcoming repeats
        </label>
        <span>
          Shaded = checklist due. Outlined = single item due. Red = corrective action to fix. Dashed = a future repeat (created when the current one is
          completed). Drag to change a due date; on a phone use the clock button in Agenda. Completed work is not shown.
          Want this in Outlook or Google? <Link href="/settings" className="underline">Settings → Calendar subscription</Link>.
        </span>
      </div>
    </div>
  )
}

function EventChip({
  event: e,
  overdue,
  onDragStart,
  onDragEnd,
}: {
  event: CalendarEvent
  overdue: boolean
  onDragStart: (key: string) => void
  onDragEnd: () => void
}) {
  const movable = e.kind !== 'projected'
  return (
    <Link
      href={`/checklists/${e.checklistId}`}
      draggable={movable}
      onDragStart={(ev) => {
        if (!movable) return ev.preventDefault()
        ev.dataTransfer.effectAllowed = 'move'
        onDragStart(e.key)
      }}
      onDragEnd={onDragEnd}
      title={
        e.kind === 'projected'
          ? `${e.title} — repeat, created when the current run is completed`
          : e.parent
            ? `${e.title} — ${e.parent}`
            : e.title
      }
      className={cn(
        'block truncate rounded px-1 py-0.5',
        e.kind === 'list' && 'bg-accent-soft text-accent hover:underline',
        e.kind === 'item' && 'border border-border text-ink hover:bg-hover',
        e.kind === 'action' && 'bg-danger-soft text-danger hover:underline',
        e.kind === 'projected' && 'border border-dashed border-border text-muted hover:bg-hover',
        movable && 'cursor-grab',
        movable && overdue && 'text-danger'
      )}
    >
      {e.title}
    </Link>
  )
}

function AgendaGroup({
  label,
  events,
  danger,
  onMove,
}: {
  label: string
  events: CalendarEvent[]
  danger?: boolean
  onMove: (key: string, day: Date) => void
}) {
  const [moving, setMoving] = useState<string | null>(null)
  return (
    <section>
      <h2 className={cn('mb-1 text-sm font-semibold', danger && 'text-danger')}>{label}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
        {events.map((e) => (
          <li key={e.key} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                e.kind === 'list' && 'bg-accent',
                e.kind === 'item' && 'border border-ink',
                e.kind === 'action' && 'bg-danger',
                e.kind === 'projected' && 'border border-dashed border-muted'
              )}
            />
            <Link href={`/checklists/${e.checklistId}`} className={cn('min-w-0 flex-1 truncate hover:underline', e.kind === 'projected' && 'text-muted')}>
              {e.title}
              {e.parent && <span className="text-muted"> — {e.parent}</span>}
              {e.kind === 'projected' && <span className="text-faint"> (repeat)</span>}
              {danger && <span className="text-faint"> · {new Date(e.date).toLocaleDateString()}</span>}
            </Link>
            {e.kind !== 'projected' &&
              (moving === e.key ? (
                <input
                  type="date"
                  autoFocus
                  defaultValue={toDateInput(new Date(e.date))}
                  onBlur={() => setMoving(null)}
                  onChange={(ev) => {
                    const [y, m, d] = ev.target.value.split('-').map(Number)
                    if (!y || y < 2000 || !m || !d) return // still typing
                    onMove(e.key, new Date(y, m - 1, d))
                    setMoving(null)
                  }}
                  className="rounded border border-border bg-panel px-1 py-0.5 text-xs"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setMoving(e.key)}
                  aria-label={`Change due date of ${e.title}`}
                  className="rounded p-1 text-muted hover:bg-hover"
                >
                  <CalendarClock className="h-4 w-4" />
                </button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
