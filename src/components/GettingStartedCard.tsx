'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'lm.gettingStarted.dismissed'

// First-run guide on the dashboard. Each step ticks itself from real data and the
// card disappears once they're all done, or when this viewer dismisses it.
export function GettingStartedCard({
  isAdmin,
  hasTemplates,
  hasChecklists,
  hasTeam,
}: {
  isAdmin: boolean
  hasTemplates: boolean
  hasChecklists: boolean
  hasTeam: boolean
}) {
  // Hidden until storage is read, so a dismissed card never flashes.
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  const steps = [
    {
      done: hasTemplates,
      title: 'Add a template',
      body: 'Pick a ready-made starter (fridge temps, vehicle checks, fire safety…) or build your own.',
      href: '/templates?starters=1',
      action: 'Browse starters',
    },
    {
      done: hasChecklists,
      title: 'Start a checklist',
      body: 'Open Templates and press "Start checklist", or use "New checklist" here for a one-off.',
      href: '/templates',
      action: 'Go to templates',
    },
    ...(isAdmin
      ? [
          {
            done: hasTeam,
            title: 'Invite your team',
            body: 'Share your organisation’s invite code — people enter it when they register.',
            href: '/settings',
            action: 'Get the invite code',
          },
        ]
      : []),
  ]

  if (dismissed || steps.every((s) => s.done)) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage blocked: hidden for this visit only
    }
  }

  const doneCount = steps.filter((s) => s.done).length

  return (
    <div className="rounded-xl border border-accent/40 bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Getting started</h2>
          <p className="text-xs text-muted">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <button onClick={dismiss} className="rounded p-1 text-muted hover:bg-hover" title="Hide this guide">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.title} className="flex items-start gap-2.5">
            {s.done ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', s.done && 'text-muted line-through')}>{s.title}</p>
              {!s.done && (
                <p className="text-xs text-muted">
                  {s.body}{' '}
                  <Link href={s.href} className="font-medium text-accent hover:underline">
                    {s.action} →
                  </Link>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Tip: the QR icon on a template prints a label — stick it where the work happens and people scan it to open
        the right checklist.
      </p>
    </div>
  )
}
