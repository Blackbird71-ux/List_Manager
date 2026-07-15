'use client'

import Link from 'next/link'
import { Calendar, ClipboardList, Users2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MyWorkChecklist, MyWorkItem } from '@/components/MyWorkClient'

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warn-soft text-warn',
  low: 'bg-hover text-muted',
}

export interface MyTeamPerson {
  id: string
  name: string
  isMe: boolean
  items: MyWorkItem[]
  checklists: MyWorkChecklist[]
}

function isOverdue(dueDate: string | null) {
  return dueDate !== null && new Date(dueDate) < new Date()
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low
      )}
    >
      {priority}
    </span>
  )
}

function DueBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs text-muted',
        isOverdue(dueDate) && 'font-semibold text-danger'
      )}
    >
      <Calendar className="h-3 w-3" />
      {new Date(dueDate).toLocaleDateString()}
    </span>
  )
}

export function MyTeamClient({
  departmentNames,
  people,
}: {
  departmentNames: string[]
  people: MyTeamPerson[]
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">My Team</h1>
        {departmentNames.length > 0 && (
          <p className="text-sm text-muted">
            Active work in {departmentNames.join(', ')} — grouped by person.
          </p>
        )}
      </div>

      {departmentNames.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Users2 className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">
            You&apos;re not in a department yet. Ask an admin to add you on the Users page.
          </p>
        </div>
      ) : (
        people.map((person) => {
          const overdueCount =
            person.items.filter((i) => isOverdue(i.dueDate)).length +
            person.checklists.filter((c) => isOverdue(c.dueDate)).length
          return (
            <section key={person.id} className="rounded-xl border border-border bg-panel">
              <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">
                  {person.name}
                  {person.isMe && <span className="font-normal text-faint"> (you)</span>}
                </h2>
                <span className="text-xs text-faint">
                  {person.checklists.length} checklist{person.checklists.length === 1 ? '' : 's'} ·{' '}
                  {person.items.length} item{person.items.length === 1 ? '' : 's'}
                </span>
                {overdueCount > 0 && (
                  <span className="ml-auto rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
                    {overdueCount} overdue
                  </span>
                )}
              </div>

              {person.checklists.length === 0 && person.items.length === 0 ? (
                <p className="px-4 py-3 text-sm text-faint">Nothing active right now.</p>
              ) : (
                <div className="divide-y divide-border-soft">
                  {person.checklists.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <Link
                        href={`/checklists/${c.id}`}
                        className="text-sm font-medium text-ink hover:text-accent hover:underline"
                      >
                        {c.title}
                      </Link>
                      <PriorityBadge priority={c.priority} />
                      <DueBadge dueDate={c.dueDate} />
                      <span className="ml-auto text-xs text-faint">
                        {c.done}/{c.total} done
                      </span>
                    </div>
                  ))}
                  {person.items.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <span className="text-sm text-ink">{item.text}</span>
                      <PriorityBadge priority={item.priority} />
                      <DueBadge dueDate={item.dueDate} />
                      <Link
                        href={`/checklists/${item.checklist.id}`}
                        className="ml-auto text-xs text-accent hover:underline"
                      >
                        {item.checklist.title}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
