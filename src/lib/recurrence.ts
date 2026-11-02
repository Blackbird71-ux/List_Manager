import { startOfDayInTz, plusInTz, type CalendarStep } from '@/lib/timezone'

export const RECURRENCE_OPTIONS = [
  'none',
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'yearly',
] as const

export type Recurrence = (typeof RECURRENCE_OPTIONS)[number]

export function isRecurrence(value: string): value is Recurrence {
  return (RECURRENCE_OPTIONS as readonly string[]).includes(value)
}

/**
 * Next due date for a respawned checklist, computed in the app timezone.
 *
 * Anchored to the current due date so a monthly list due on the 1st stays on
 * the 1st regardless of when it was completed. If the anchor is already in
 * the past (list completed late), advance until the result is in the future.
 * A checklist with no due date anchors from today.
 */
export function computeNextDueDate(currentDue: Date | null, recurrence: Recurrence): Date | null {
  if (recurrence === 'none') return null

  const step: CalendarStep = {
    daily: { days: 1 },
    weekly: { weeks: 1 },
    fortnightly: { weeks: 2 },
    monthly: { months: 1 },
    quarterly: { months: 3 },
    yearly: { years: 1 },
  }[recurrence]
  const today = startOfDayInTz()
  const anchor = currentDue ? startOfDayInTz(currentDue) : today

  let next = plusInTz(anchor, step)
  while (next <= today) {
    next = plusInTz(next, step)
  }
  return next
}

/**
 * Due dates of the runs a recurring list will spawn after the current one,
 * up to `until` (inclusive). The next run doesn't exist until the current one
 * is completed, so these are a forecast for the calendar, not records. Chained
 * through computeNextDueDate exactly as real spawns are, so the forecast
 * matches what will actually be created (assuming on-time completion).
 */
export function projectOccurrences(currentDue: Date, recurrence: Recurrence, until: Date, max = 400): Date[] {
  const out: Date[] = []
  let next = computeNextDueDate(currentDue, recurrence)
  while (next && next <= until && out.length < max) {
    out.push(next)
    next = computeNextDueDate(next, recurrence)
  }
  return out
}
