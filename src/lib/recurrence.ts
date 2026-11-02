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
