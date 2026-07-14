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
