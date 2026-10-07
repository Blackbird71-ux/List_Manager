import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))

import { splitDigestRows } from '@/lib/my-digest'

describe('splitDigestRows', () => {
  const now = new Date('2026-07-14T00:00:00Z')
  const d = (iso: string) => new Date(iso)

  it('separates overdue from upcoming and orders each by due date', () => {
    const { overdue, upcoming } = splitDigestRows(
      [
        { title: 'b', dueDate: d('2026-07-15T00:00:00Z'), href: '' },
        { title: 'old', dueDate: d('2026-07-10T00:00:00Z'), href: '' },
        { title: 'older', dueDate: d('2026-07-01T00:00:00Z'), href: '' },
        { title: 'a', dueDate: d('2026-07-14T00:00:00Z'), href: '' },
      ],
      now
    )
    expect(overdue.map((r) => r.title)).toEqual(['older', 'old'])
    expect(upcoming.map((r) => r.title)).toEqual(['a', 'b'])
  })
})
