'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { HelpCircle, X } from 'lucide-react'

interface HelpTopic {
  title: string
  points: string[]
}

// Help content keyed by where the user currently is in the app.
function topicsFor(pathname: string): { heading: string; topics: HelpTopic[] } {
  if (pathname.startsWith('/checklists/')) {
    return {
      heading: 'Working on a checklist',
      topics: [
        {
          title: 'Ticking items',
          points: [
            'Tick a box to mark an item done — your name and the time are recorded so the team can see who did what.',
            'Ticking the last item completes the whole checklist automatically.',
            'Unticking an item on a completed checklist reopens it.',
          ],
        },
        {
          title: 'Reordering items',
          points: [
            'Drag the grip handle on the left of an item to move it up or down.',
            'The new order is saved for everyone.',
          ],
        },
        {
          title: 'Item details',
          points: [
            'Use the speech-bubble button on an item to add notes, attach files, set a priority or assign it to someone.',
            'Assignees are notified when a checklist is assigned to them.',
          ],
        },
        {
          title: 'Comments & activity',
          points: [
            'The Comments tab at the bottom is for discussion — the creator and assignee are notified of new comments.',
            'The Activity tab shows a full history: who created, edited, ticked, reordered or completed things, and when.',
          ],
        },
        {
          title: 'Recurrence & running again',
          points: [
            'A recurring checklist spawns a fresh copy the moment it is completed, with the next due date set.',
            'For one-off lists, use "Run this checklist again" after completion to start a fresh copy manually.',
            'Reset unticks everything on the current copy instead of creating a new one.',
          ],
        },
        {
          title: 'Visibility & sharing',
          points: [
            'Team checklists are visible to everyone in your organisation; department ones only to members of the chosen departments; private ones only to you, assignees and people you share with.',
            'Managers and admins can always see every checklist.',
          ],
        },
      ],
    }
  }
  if (pathname.startsWith('/my-team')) {
    return {
      heading: 'My Team',
      topics: [
        {
          title: 'What this page shows',
          points: [
            'Active checklists and items assigned to anyone in your department(s), grouped by person.',
            'Overdue work is flagged in red so you can see who needs a hand.',
            'You only see checklists you have access to — private lists stay private.',
          ],
        },
        {
          title: 'Departments',
          points: [
            'Admins set up departments and their members on the Users page.',
            'If this page says you\'re not in a department, ask an admin to add you.',
          ],
        },
      ],
    }
  }
  if (pathname.startsWith('/completed')) {
    return {
      heading: 'Completed checklists',
      topics: [
        {
          title: 'Browsing history',
          points: [
            'Completed checklists are kept forever as a record, grouped by month.',
            'Use the search box and category filter to narrow things down.',
          ],
        },
        {
          title: 'Export',
          points: [
            'Export CSV downloads whatever the current filters show, ready for Excel.',
            'The export includes who created and was assigned each list, item counts and completion times.',
          ],
        },
      ],
    }
  }
  if (pathname.startsWith('/templates')) {
    return {
      heading: 'Templates',
      topics: [
        {
          title: 'How templates work',
          points: [
            'A template is a reusable master. Starting a checklist from it makes a copy — the master is never changed by day-to-day work.',
            'Templates carry items, custom fields, a default category, priority and recurrence.',
          ],
        },
        {
          title: 'Versioning',
          points: [
            'Editing a template\'s items or fields bumps its version number.',
            'Each checklist remembers which template version it was created from, so old runs stay accurate.',
          ],
        },
      ],
    }
  }
  if (pathname.startsWith('/reports')) {
    return {
      heading: 'Team reports',
      topics: [
        {
          title: 'Reading the numbers',
          points: [
            'Pick a time window (7 days to 1 year) — completed counts and averages are for that window.',
            '"Overdue now" is live: active checklists whose due date has passed.',
            '"Items ticked" counts individual checkbox ticks per person in the window.',
          ],
        },
        {
          title: 'Who can see this',
          points: ['Reports cover the whole team and are only visible to managers and admins.'],
        },
      ],
    }
  }
  if (pathname.startsWith('/settings')) {
    return {
      heading: 'Settings',
      topics: [
        {
          title: 'Personal settings',
          points: [
            'Theme only changes how the app looks on this device.',
            'Changing your display name takes effect the next time you sign in.',
          ],
        },
        {
          title: 'Organisation',
          points: [
            'Admins can rename the organisation and see its invite code here.',
            'Give the invite code to new people — they pick "Join with code" when registering. Regenerate it if it leaks.',
          ],
        },
        {
          title: 'Registration (admins)',
          points: [
            'The Registration section controls whether visitors can create brand-new organisations on this server. Joining with an invite code always works.',
          ],
        },
        {
          title: 'Email (admins)',
          points: [
            'The Email section powers "Forgot password?" reset links. For Gmail, create an app password at myaccount.google.com/apppasswords and use that — never your real password.',
            'Settings are stored in the app database, not in files on the server. Use "Send test email" to check they work.',
          ],
        },
        {
          title: 'Remote access (admins)',
          points: [
            'The Remote access section manages the Cloudflare tunnel that makes the app reachable from outside the network.',
            'It only works when the app is running on the NAS, not in local development.',
          ],
        },
      ],
    }
  }
  if (pathname.startsWith('/admin/users')) {
    return {
      heading: 'Managing users',
      topics: [
        {
          title: 'Roles',
          points: [
            'Member: sees team checklists, department checklists for their departments, plus anything private they created, were assigned or had shared with them.',
            'Manager: sees every checklist (including private ones) and the reports page.',
            'Admin: everything a manager has, plus user management and the remote-access tunnel.',
          ],
        },
        {
          title: 'Departments',
          points: [
            'Departments group people so checklists can be limited to just the right team — set "Department" visibility on a checklist.',
            'People can belong to several departments, and the My Team page shows colleagues\' active work.',
            'Deleting a department leaves its checklists visible only to their creator, assignees and managers.',
          ],
        },
        {
          title: 'Password resets',
          points: [
            'Use the key button on a user to set a new password for them directly.',
            'Users can also reset their own password from the "Forgot password?" link on the sign-in screen — this emails them a one-time link, so an admin must first set up email in Settings.',
          ],
        },
      ],
    }
  }
  return {
    heading: 'Your checklists',
    topics: [
      {
        title: 'The dashboard',
        points: [
          'This page shows active checklists you can see — use the filters to narrow by category, assignee or search.',
          'Overdue checklists are flagged; due dates keep the team honest.',
        ],
      },
      {
        title: 'Creating checklists',
        points: [
          'Start from a template (the master stays untouched) or build a one-off list from scratch.',
          'Assign it, set a due date and priority, and choose team, department or private visibility.',
        ],
      },
      {
        title: 'Recurring work',
        points: [
          'Set recurrence (daily to yearly) and a fresh copy spawns automatically each time the list is completed.',
        ],
      },
      {
        title: 'Notifications',
        points: [
          'The bell shows assignments, shares, comments and overdue alerts addressed to you.',
        ],
      },
    ],
  }
}

export function HelpMenu() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const { heading, topics } = topicsFor(pathname)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-muted hover:bg-hover"
        aria-label="Help"
        title="Help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {/* Portal to body: the sticky header's backdrop-blur creates a containing
          block that would otherwise trap this fixed-position overlay inside it. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Help">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-panel shadow-xl">
            <div className="flex items-center gap-2 border-b border-border-soft px-5 py-4">
              <HelpCircle className="h-5 w-5 text-accent" />
              <h2 className="font-semibold">{heading}</h2>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg p-1.5 text-muted hover:bg-hover"
                aria-label="Close help"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {topics.map((t) => (
                <div key={t.title}>
                  <h3 className="text-sm font-semibold">{t.title}</h3>
                  <ul className="mt-1.5 space-y-1.5">
                    {t.points.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="border-t border-border-soft pt-3 text-xs text-faint">
                Help changes with the page you&apos;re on — open it anywhere to see what that
                screen can do.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
