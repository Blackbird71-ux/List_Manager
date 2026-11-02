import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { OPEN_ACTION } from '@/lib/corrective-actions'
import { isRecurrence, projectOccurrences } from '@/lib/recurrence'
import { formatInTzPattern, plusInTz, todayStart } from '@/lib/timezone'

export interface CalendarEvent {
  key: string
  // "projected": a future run of a recurring list that doesn't exist yet.
  // "action": the fix-by date of an open corrective action on a failed item.
  kind: 'list' | 'item' | 'action' | 'projected'
  title: string
  parent?: string
  checklistId: string
  date: string
}

/** How far ahead recurring lists are forecast on the calendar and feed. */
export const PROJECTION_MONTHS = 12

/**
 * Everything still open with a due date that this user may see (open
 * corrective actions included, even on finished lists), plus the
 * forecast runs of recurring lists up to PROJECTION_MONTHS ahead.
 */
export async function getCalendarEvents(user: { id: string; role: string; organizationId: string }): Promise<CalendarEvent[]> {
  const access = checklistAccessWhere(user.id, user.role, user.organizationId)
  const [lists, items, actions] = await Promise.all([
    prisma.checklist.findMany({
      where: { status: 'active', dueDate: { not: null }, ...access },
      select: { id: true, title: true, dueDate: true, recurrence: true },
    }),
    prisma.checklistItem.findMany({
      where: { checked: false, dueDate: { not: null }, checklist: { status: 'active', ...access } },
      select: { id: true, text: true, dueDate: true, checklist: { select: { id: true, title: true } } },
      take: 2000,
    }),
    prisma.checklistItem.findMany({
      where: { ...OPEN_ACTION, actionDueDate: { not: null }, checklist: access },
      select: { id: true, text: true, actionDueDate: true, checklist: { select: { id: true, title: true } } },
      take: 2000,
    }),
  ])

  const until = plusInTz(todayStart(), { months: PROJECTION_MONTHS })
  return [
    ...lists.map((c) => ({
      key: `c${c.id}`,
      kind: 'list' as const,
      title: c.title,
      checklistId: c.id,
      date: c.dueDate!.toISOString(),
    })),
    ...lists.flatMap((c) =>
      isRecurrence(c.recurrence)
        ? projectOccurrences(c.dueDate!, c.recurrence, until).map((d) => ({
            key: `p${c.id}-${d.getTime()}`,
            kind: 'projected' as const,
            title: c.title,
            checklistId: c.id,
            date: d.toISOString(),
          }))
        : []
    ),
    ...items.map((i) => ({
      key: `i${i.id}`,
      kind: 'item' as const,
      title: i.text,
      parent: i.checklist.title,
      checklistId: i.checklist.id,
      date: i.dueDate!.toISOString(),
    })),
    ...actions.map((a) => ({
      key: `a${a.id}`,
      kind: 'action' as const,
      title: `Fix: ${a.text}`,
      parent: a.checklist.title,
      checklistId: a.checklist.id,
      date: a.actionDueDate!.toISOString(),
    })),
  ]
}

// ── iCal subscription feed ─────────────────────────────────────────────────
// Calendar apps can't log in, so each user gets a secret feed URL. Only the
// sha256 of the token is stored; the URL is shown once when generated.

export function newFeedToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('hex')
  return { token, hash: hashFeedToken(token) }
}

export const hashFeedToken = (token: string) => createHash('sha256').update(token).digest('hex')

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([;,])/g, '\\$1')

// RFC 5545: lines over 75 octets are folded with CRLF + space.
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (Buffer.byteLength(rest) > 75) {
    let cut = 74
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

/** All-day VEVENTs (in the app timezone) linking back to each checklist. */
export function buildIcs(events: CalendarEvent[], origin: string): string {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '') // UTC, e.g. 20261102T010203Z
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lists Manager//Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Lists Manager']
  for (const e of events) {
    const day = new Date(e.date)
    const summary =
      e.kind === 'item' || e.kind === 'action' ? `${e.title} (${e.parent})` : e.kind === 'projected' ? `${e.title} (scheduled)` : e.title
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.key}@listsmanager`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatInTzPattern(day, 'yyyyMMdd')}`,
      `DTEND;VALUE=DATE:${formatInTzPattern(plusInTz(day, { days: 1 }), 'yyyyMMdd')}`,
      `SUMMARY:${icsText(summary)}`,
      `URL:${origin}/checklists/${e.checklistId}`,
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
