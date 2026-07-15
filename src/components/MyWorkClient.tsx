'use client'

import Link from 'next/link'
import { Calendar, ClipboardList, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warn-soft text-warn',
  low: 'bg-hover text-muted',
}

export interface MyWorkItem {
  id: string
  text: string
  priority: string | null
  dueDate: string | null
  checklist: { id: string; title: string }
}

export interface MyWorkChecklist {
  id: string
  title: string
  priority: string
  dueDate: string | null
  done: number
  total: number
}

function isOverdue(dueDate: string | null) {
  return dueDate !== null && new Date(dueDate) < new Date()
}

export function MyWorkClient({
  items,
  checklists,
}: {
  items: MyWorkItem[]
  checklists: MyWorkChecklist[]
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">My Work</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">My items</h2>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center">
            <ListChecks className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-2 text-sm text-faint">Nothing assigned to you. Enjoy the breather.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-panel">
            {items.map((item) => {
              const overdue = isOverdue(item.dueDate)
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <span className="text-sm text-ink">{item.text}</span>
                  {item.priority && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low
                      )}
                    >
                      {item.priority}
                    </span>
                  )}
                  {item.dueDate && (
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs text-muted',
                        overdue && 'font-semibold text-danger'
                      )}
                    >
                      <Calendar className="h-3 w-3" />
                      {new Date(item.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <Link
                    href={`/checklists/${item.checklist.id}`}
                    className="ml-auto text-xs text-accent hover:underline"
                  >
                    {item.checklist.title}
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted">My checklists</h2>
        {checklists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-2 text-sm text-faint">No checklists assigned to you right now.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {checklists.map((c) => {
              const overdue = isOverdue(c.dueDate)
              const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0
              return (
                <Link
                  key={c.id}
                  href={`/checklists/${c.id}`}
                  className="rounded-xl border border-border bg-panel p-4 transition hover:border-accent hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-ink">{c.title}</h3>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        PRIORITY_STYLES[c.priority] ?? PRIORITY_STYLES.low
                      )}
                    >
                      {c.priority}
                    </span>
                  </div>

                  {c.dueDate && (
                    <div
                      className={cn(
                        'mt-2 flex items-center gap-1 text-xs text-muted',
                        overdue && 'font-semibold text-danger'
                      )}
                    >
                      <Calendar className="h-3 w-3" />
                      {new Date(c.dueDate).toLocaleDateString()}
                    </div>
                  )}

                  {c.total > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[11px] text-faint">
                        <span>
                          {c.done}/{c.total} done
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-hover">
                        <div
                          className={cn('h-1.5 rounded-full', pct === 100 ? 'bg-ok' : 'bg-accent')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
