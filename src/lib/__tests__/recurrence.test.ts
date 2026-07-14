import { DateTime, Settings } from 'luxon'
import { afterEach, describe, expect, it } from 'vitest'
import { computeNextDueDate, isRecurrence, RECURRENCE_OPTIONS } from '@/lib/recurrence'
import { APP_TIMEZONE } from '@/lib/timezone'

// Pin "now" to a fixed instant: 2026-07-14 10:00 in Australia/Sydney
const FIXED_NOW = DateTime.fromISO('2026-07-14T10:00:00', { zone: APP_TIMEZONE })
Settings.now = () => FIXED_NOW.toMillis()

afterEach(() => {
  Settings.now = () => FIXED_NOW.toMillis()
})

function sydneyDate(iso: string): Date {
  return DateTime.fromISO(iso, { zone: APP_TIMEZONE }).toJSDate()
}

function asSydneyISODate(d: Date | null): string | null {
  return d ? DateTime.fromJSDate(d).setZone(APP_TIMEZONE).toISODate() : null
}

describe('isRecurrence', () => {
  it('accepts every option', () => {
    for (const opt of RECURRENCE_OPTIONS) {
      expect(isRecurrence(opt)).toBe(true)
    }
  })

  it('rejects unknown values', () => {
    expect(isRecurrence('biweekly')).toBe(false)
    expect(isRecurrence('')).toBe(false)
  })
})

describe('computeNextDueDate', () => {
  it('returns null for none', () => {
    expect(computeNextDueDate(sydneyDate('2026-07-01'), 'none')).toBeNull()
    expect(computeNextDueDate(null, 'none')).toBeNull()
  })

  it('steps each interval from a future-ish anchor (due today)', () => {
    const due = sydneyDate('2026-07-14')
    expect(asSydneyISODate(computeNextDueDate(due, 'daily'))).toBe('2026-07-15')
    expect(asSydneyISODate(computeNextDueDate(due, 'weekly'))).toBe('2026-07-21')
    expect(asSydneyISODate(computeNextDueDate(due, 'fortnightly'))).toBe('2026-07-28')
    expect(asSydneyISODate(computeNextDueDate(due, 'monthly'))).toBe('2026-08-14')
    expect(asSydneyISODate(computeNextDueDate(due, 'quarterly'))).toBe('2026-10-14')
    expect(asSydneyISODate(computeNextDueDate(due, 'yearly'))).toBe('2027-07-14')
  })

  it('keeps the day-of-month anchor for monthly lists', () => {
    // Monthly list due on the 1st, completed on the 14th -> next due Aug 1
    const due = sydneyDate('2026-07-01')
    expect(asSydneyISODate(computeNextDueDate(due, 'monthly'))).toBe('2026-08-01')
  })

  it('advances a long-overdue anchor past today', () => {
    // Weekly list last due in May; next occurrence must be in the future,
    // still on the same weekday as the anchor (Monday 2026-05-04)
    const due = sydneyDate('2026-05-04')
    const next = computeNextDueDate(due, 'weekly')
    const nextDt = DateTime.fromJSDate(next!).setZone(APP_TIMEZONE)
    expect(nextDt > FIXED_NOW.startOf('day')).toBe(true)
    expect(nextDt.weekday).toBe(1)
    expect(asSydneyISODate(next)).toBe('2026-07-20')
  })

  it('a monthly anchor exactly one step behind today advances two steps', () => {
    // Due 2026-06-14; +1 month = 2026-07-14 which is today (not future) -> 2026-08-14
    const due = sydneyDate('2026-06-14')
    expect(asSydneyISODate(computeNextDueDate(due, 'monthly'))).toBe('2026-08-14')
  })

  it('anchors from today when there is no due date', () => {
    expect(asSydneyISODate(computeNextDueDate(null, 'daily'))).toBe('2026-07-15')
    expect(asSydneyISODate(computeNextDueDate(null, 'monthly'))).toBe('2026-08-14')
  })

  it('handles month-end clamping', () => {
    // Monthly due Jan 31 -> Luxon clamps to Feb 28/29
    const january = DateTime.fromISO('2026-01-15T10:00:00', { zone: APP_TIMEZONE }).toMillis()
    Settings.now = () => january
    const due = sydneyDate('2026-01-31')
    expect(asSydneyISODate(computeNextDueDate(due, 'monthly'))).toBe('2026-02-28')
  })
})
