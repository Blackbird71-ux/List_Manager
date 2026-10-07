'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { HelpCircle, X } from 'lucide-react'

interface HelpTopic {
  title: string
  points: string[]
}

// Pages tell the help menu what state they are in (e.g. "pending-signoff") so it
// can lead with what matters right now. Tags are plain strings; see topicsFor.
interface HelpContextValue {
  tags: string[]
  setTags: (tags: string[]) => void
}

const HelpContext = createContext<HelpContextValue>({ tags: [], setTags: () => {} })

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [tags, setTags] = useState<string[]>([])
  const value = useMemo(() => ({ tags, setTags }), [tags])
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}

// Register the current page state with the help menu; cleared when the page unmounts.
export function useHelpTags(tags: string[]) {
  const { setTags } = useContext(HelpContext)
  const key = tags.join(',')
  useEffect(() => {
    setTags(key ? key.split(',') : [])
    return () => setTags([])
  }, [key, setTags])
}

// "Right now" topics for a checklist, based on its state and the viewer's role.
function checklistNowTopics(tags: string[]): HelpTopic[] {
  const has = (t: string) => tags.includes(t)
  const out: HelpTopic[] = []
  if (has('can-approve')) {
    out.push({
      title: 'This list needs your sign-off',
      points: [
        'Review the list, then use Approve to close it off or Send back (with a reason) to reopen it for more work.',
        'Failed items are shown with a red Fail badge so you can check them first.',
      ],
    })
  } else if (has('pending-signoff-own')) {
    out.push({
      title: 'Waiting for sign-off',
      points: [
        'You completed this list, so a different manager or admin has to approve it (the four-eyes rule).',
        'If it is sent back you will be notified and the list reopens.',
      ],
    })
  } else if (has('pending-signoff')) {
    out.push({
      title: 'Waiting for sign-off',
      points: ['This list is finished but a manager or admin still has to approve it.'],
    })
  } else if (has('signed-off')) {
    out.push({
      title: 'Signed off',
      points: ['A manager has approved this list. The approver, time and any note are shown under the title.'],
    })
  } else if (has('completed')) {
    out.push({
      title: 'This list is complete',
      points: [
        'Use "Run this checklist again" for a fresh copy, or Reopen to carry on working on this one.',
        'Unticking any item also reopens the list.',
      ],
    })
  }
  if (has('recurring') && !has('completed')) {
    out.push({
      title: 'This list repeats',
      points: ['When the last item is ticked, the next copy is created automatically with the next due date.'],
    })
  }
  if (has('overdue')) {
    out.push({
      title: 'This list is overdue',
      points: ['Its due date has passed. Change the date in the details card, or finish the remaining items.'],
    })
  }
  if (has('can-manage') && !has('requires-signoff') && !has('completed')) {
    out.push({
      title: 'Need a second pair of eyes?',
      points: ['Tick "needs sign-off" under the title and a manager must approve the list once it is finished.'],
    })
  }
  return out
}

// Help content keyed by where the user currently is in the app.
function topicsFor(
  pathname: string,
  tags: string[],
  role: string
): { heading: string; topics: HelpTopic[] } {
  const isAdmin = role === 'admin'
  const result = baseTopicsFor(pathname)
  // Admin-only sections are noise for everyone else.
  if (!isAdmin) result.topics = result.topics.filter((t) => !t.title.includes('(admins)'))
  if (pathname.startsWith('/checklists/')) {
    result.topics = [...checklistNowTopics(tags), ...result.topics]
  }
  return result
}

function baseTopicsFor(pathname: string): { heading: string; topics: HelpTopic[] } {
  if (pathname.startsWith('/checklists/')) {
    return {
      heading: 'Working on a checklist',
      topics: [
        {
          title: 'Page layout',
          points: [
            'On a wide screen the list sits on the left and everything else — title and buttons, the selected item, list details, sharing, documents and comments — is in a side column on the right.',
            'Drag the thin bar between them to resize the side column; double-click it to reset. Your width is remembered on this device.',
            'On a narrow screen or phone everything stacks in one column, and item details open under the item.',
          ],
        },
        {
          title: 'Ticking items',
          points: [
            'Tick the box at the right of an item to mark it done — your name and the time are recorded.',
            'Ticking the last item completes the whole checklist automatically.',
            'Unticking an item on a completed checklist reopens it.',
            'Use "Mark all remaining" above the list to tick everything left in one go — as Done, Pass or N/A.',
          ],
        },
        {
          title: 'Item details',
          points: [
            'Click an item (or its speech-bubble button) to open its details in the side column: assignee, priority, due date, notes and attachments.',
            'Result: mark an item Pass, Fail or N/A. The result shows as a badge on the row and is kept in the record.',
            'The + button adds a subtask beneath an item. Subtasks are indented under their parent.',
            '"Only show this item when…" hides an item until an earlier item has the chosen result (e.g. show "Raise defect" only when "Smoke alarm" is Fail). Hidden items do not count towards completion.',
            '"Due days before list" gives the item its own due date, that many days before the list is due.',
            'On a phone, "Take photo" opens the camera and attaches the picture to the item.',
            'Assignees are notified when an item or checklist is assigned to them.',
          ],
        },
        {
          title: 'Printing',
          points: [
            'The printer icon in the header opens a clean record of the list — results, who ticked what and when, sign-off — ready to print or save as PDF.',
          ],
        },
        {
          title: 'Reordering items',
          points: [
            'Drag the grip handle at the right-hand end of an item to move it up or down. The new order is saved for everyone.',
          ],
        },
        {
          title: 'Sections',
          points: [
            'Lists imported from a file or template can have section headings. Click a heading to collapse or expand that section; it shows how many items in it are done.',
          ],
        },
        {
          title: 'Due date & reminders',
          points: [
            'Set a due date in the details card, then choose a reminder (for example 1 day before) and the assignee is notified at that time.',
            'Overdue lists are flagged in red on the dashboard and in My Work.',
          ],
        },
        {
          title: 'Supporting documents',
          points: [
            'Attach files that belong to the whole list (not a single item) under Supporting documents. Up to 10 MB each; anyone who can see the list can download them.',
            'Use the attachments inside an item\'s details for files that belong to that one item.',
          ],
        },
        {
          title: 'Comments & activity',
          points: [
            'The Comments tab is for discussion — type @ to mention a colleague; the creator, assignee and anyone mentioned are notified.',
            'The Activity tab is a full history: who created, edited, ticked, uploaded, signed off or completed things, and when.',
          ],
        },
        {
          title: 'Sign-off',
          points: [
            'Tick "needs sign-off" under the title (creator, manager or admin) to require approval once the list is finished.',
            'A completed list then waits for a manager or admin to Approve it or Send it back. The person who completed it cannot approve their own work.',
          ],
        },
        {
          title: 'Recurrence & running again',
          points: [
            'A recurring checklist spawns a fresh copy the moment it is completed, with the next due date set.',
            'For one-off lists, use "Run this checklist again" after completion to start a fresh copy.',
            'Reset unticks everything on the current copy instead of creating a new one.',
            'The save icon next to Complete turns this list into a reusable template.',
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
  if (pathname.startsWith('/my-work')) {
    return {
      heading: 'My Work',
      topics: [
        {
          title: 'What this page shows',
          points: [
            'Everything assigned to you in one place: individual items on top, and whole checklists assigned to you below with their progress.',
            'Overdue items and lists are flagged in red. Click any row to jump straight to that checklist.',
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
            'Use "Start checklist" on a template to create a working copy.',
            'Each template item can have an "Only if…" condition and a "Due N days before list" offset; both carry into every checklist started from it.',
          ],
        },
        {
          title: 'Importing & exporting',
          points: [
            'Import accepts Word (.docx), Excel (.xlsx), CSV, Markdown, plain text and JSON. Numbered headings become sections, and a line ending in a colon followed by a comma-separated list becomes an item with subtasks. You review the result before it is saved as a new template.',
            'Export downloads all your templates as a JSON file you can import elsewhere.',
            'You can also save any checklist as a template with the save icon on its page.',
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
          title: 'Google Drive backup (admins)',
          points: [
            'Every night at 03:30 the database and any new uploaded files are copied to a "Lists Manager Backups" folder in your Google Drive. The newest 30 database copies are kept.',
            'Set up once: create a Web-application OAuth client in Google Cloud Console, add the redirect URI shown in the section, save the client ID and secret here, then click Connect Google Drive (from the https address).',
            '"Back up now" runs a backup immediately and shows the result. Disconnecting leaves existing Drive copies in place.',
          ],
        },
        {
          title: 'Escalation & webhook (admins)',
          points: [
            'Escalation: set a number of days and, each morning at 08:00, admins and managers are notified about active lists overdue by that long. Each list is escalated once. 0 switches it off.',
            'Webhook: a public https address that receives a signed JSON event when a list is completed or signed off. Verify the X-ListsManager-Signature header with the signing secret shown here.',
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
          'Click a tile (e.g. Overdue) to filter the list to those checklists. Use the due-date filter for "today" or "next 7 days".',
          'Save a combination of filters with "+ Save current filters"; saved views appear as chips and follow your account.',
          'The Calendar page shows lists and dated items by month.',
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
          'The bell shows assignments, shares, comments, sign-off requests and overdue alerts addressed to you.',
        ],
      },
      {
        title: 'Finding things fast',
        points: [
          'Press Ctrl+K (⌘K on a Mac) anywhere to search checklists and items.',
          'My Work lists everything assigned to you; Completed is the permanent record.',
        ],
      },
    ],
  }
}

export function HelpMenu({ role }: { role: string }) {
  const pathname = usePathname()
  const { tags } = useContext(HelpContext)
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

  const { heading, topics } = topicsFor(pathname, tags, role)

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
