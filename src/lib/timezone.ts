import { DateTime } from 'luxon'

// The server runs in UTC; all date boundaries are computed in the app
// timezone via Luxon. App code calls these helpers, never Luxon directly.
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Australia/Sydney'

/** Start of today (local midnight) as a UTC Date. */
export function todayStart(): Date {
  return DateTime.now().setZone(APP_TIMEZONE).startOf('day').toJSDate()
}

/** Format a date for display in the app timezone. */
export function formatInTz(date: Date | string, options: Intl.DateTimeFormatOptions): string {
  const dt = typeof date === 'string' ? DateTime.fromISO(date) : DateTime.fromJSDate(date)
  return dt.setZone(APP_TIMEZONE).toLocaleString(options)
}

/** Format a date in the app timezone with a Luxon pattern, e.g. 'yyyy-MM-dd HH:mm'. */
export function formatInTzPattern(date: Date, pattern: string): string {
  return DateTime.fromJSDate(date).setZone(APP_TIMEZONE).toFormat(pattern)
}

/** Local midnight of the given date (default: today, via Luxon's clock) as a UTC Date. */
export function startOfDayInTz(date?: Date): Date {
  const dt = date ? DateTime.fromJSDate(date) : DateTime.now()
  return dt.setZone(APP_TIMEZONE).startOf('day').toJSDate()
}

export type CalendarStep = { days?: number; weeks?: number; months?: number; years?: number }

/** Add a calendar step in the app timezone (DST-safe; months clamp to month end). */
export function plusInTz(date: Date, step: CalendarStep): Date {
  return DateTime.fromJSDate(date).setZone(APP_TIMEZONE).plus(step).toJSDate()
}

/** Bounds of the local week (Monday start) `weeksAgo` weeks before this one. */
export function weekBoundsInTz(weeksAgo: number): { start: Date; end: Date } {
  const start = DateTime.now().setZone(APP_TIMEZONE).startOf('week').minus({ weeks: weeksAgo })
  return { start: start.toJSDate(), end: start.plus({ weeks: 1 }).toJSDate() }
}
