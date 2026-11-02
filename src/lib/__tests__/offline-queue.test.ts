import { describe, expect, it } from 'vitest'
import { MAX_OFFLINE_AGE_MS, applyPending, offlineTimestamp, type QueuedChange } from '@/lib/offline-queue'

const base = {
  id: 'i1',
  kind: 'check',
  checked: false,
  value: '',
  result: '',
  notes: '',
  minValue: null as number | null,
  maxValue: null as number | null,
}

const change = (data: Record<string, unknown>, itemId = 'i1'): QueuedChange => ({
  userId: 'u1',
  checklistId: 'c1',
  itemId,
  data,
  queuedAt: '2026-11-01T00:00:00.000Z',
})

describe('applyPending', () => {
  it('returns the same items when nothing is queued', () => {
    const items = [base]
    expect(applyPending(items, [])).toBe(items)
  })

  it('applies changes in order and only to their item', () => {
    const [a, b] = applyPending(
      [base, { ...base, id: 'i2' }],
      [change({ checked: true }), change({ notes: 'Mopped' }), change({ checked: false })]
    )
    expect(a).toMatchObject({ checked: false, notes: 'Mopped' })
    expect(b).toEqual({ ...base, id: 'i2' })
  })

  it('a reading ticks the item and judges it against the range', () => {
    const [r] = applyPending([{ ...base, kind: 'number', maxValue: 5 }], [change({ value: ' 7 ' })])
    expect(r).toMatchObject({ value: '7', checked: true, result: 'fail' })
  })

  it('a result ticks the item; unticking clears the answer and result', () => {
    const [r] = applyPending([{ ...base, kind: 'text' }], [change({ value: 'ok', result: 'pass' }), change({ checked: false })])
    expect(r).toMatchObject({ checked: false, value: '', result: '' })
  })

  it('is idempotent when the server copy already includes the change', () => {
    const synced = { ...base, checked: true, notes: 'x' }
    const [r] = applyPending([synced], [change({ checked: true, notes: 'x' })])
    expect(r).toEqual(synced)
  })
})

describe('offlineTimestamp', () => {
  const now = new Date('2026-11-02T00:00:00.000Z')

  it('uses the offline time when plausible', () => {
    expect(offlineTimestamp('2026-11-01T09:30:00.000Z', now).toISOString()).toBe('2026-11-01T09:30:00.000Z')
  })

  it('falls back to now when missing, in the future, too old or invalid', () => {
    expect(offlineTimestamp(undefined, now)).toBe(now)
    expect(offlineTimestamp('2026-11-03T00:00:00.000Z', now)).toBe(now)
    expect(offlineTimestamp(new Date(now.getTime() - MAX_OFFLINE_AGE_MS - 1).toISOString(), now)).toBe(now)
    expect(offlineTimestamp('nonsense', now)).toBe(now)
  })
})
