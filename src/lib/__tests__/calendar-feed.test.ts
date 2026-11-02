import { DateTime } from 'luxon'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { buildIcs, hashFeedToken, newFeedToken } from '@/lib/calendar'
import { APP_TIMEZONE } from '@/lib/timezone'

const sydney = (iso: string) => DateTime.fromISO(iso, { zone: APP_TIMEZONE }).toJSDate().toISOString()

describe('feed tokens', () => {
  it('stores only a hash that matches the token', () => {
    const { token, hash } = newFeedToken()
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    expect(hash).not.toContain(token)
    expect(hashFeedToken(token)).toBe(hash)
  })
})

describe('buildIcs', () => {
  const ics = buildIcs(
    [
      { key: 'cA', kind: 'list', title: 'Fire safety, level 2; east', checklistId: 'A', date: sydney('2026-10-05') },
      { key: 'iB', kind: 'item', title: 'Check extinguisher', parent: 'Fire safety', checklistId: 'A', date: sydney('2026-10-04') },
      { key: 'pA-1', kind: 'projected', title: 'Fire safety', checklistId: 'A', date: sydney('2026-11-05') },
      { key: 'aC', kind: 'action', title: 'Fix: Exit sign lit', parent: 'Fire safety', checklistId: 'A', date: sydney('2026-10-07') },
    ],
    'https://lists.example.com'
  )

  it('writes all-day events on the local (not UTC) date', () => {
    // 2026-10-05 00:00 Sydney is 2026-10-04 13:00 UTC; the event must be the 5th.
    expect(ics).toContain('DTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261006')
  })

  it('escapes text, labels items and repeats, and links back', () => {
    expect(ics).toContain('SUMMARY:Fire safety\\, level 2\\; east')
    expect(ics).toContain('SUMMARY:Check extinguisher (Fire safety)')
    expect(ics).toContain('SUMMARY:Fire safety (scheduled)')
    expect(ics).toContain('SUMMARY:Fix: Exit sign lit (Fire safety)')
    expect(ics).toContain('URL:https://lists.example.com/checklists/A')
  })

  it('uses CRLF and folds long lines', () => {
    const long = buildIcs([{ key: 'c1', kind: 'list', title: 'x'.repeat(200), checklistId: '1', date: sydney('2026-10-05') }], '')
    expect(long.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true)
    expect(long.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })
})
