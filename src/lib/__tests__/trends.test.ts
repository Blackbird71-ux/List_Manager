import { describe, expect, it } from 'vitest'
import { actionStats, checkStats, readingStats, type TrendItem } from '@/lib/trends'

const day = (d: number) => new Date(Date.UTC(2026, 9, d, 0, 0))

function item(over: Partial<TrendItem>): TrendItem {
  return {
    text: 'Item',
    kind: 'check',
    result: '',
    value: '',
    unit: '',
    minValue: null,
    maxValue: null,
    checkedAt: day(1),
    actionDueDate: null,
    actionClosedAt: null,
    source: 'Template',
    ...over,
  }
}

describe('checkStats', () => {
  it('groups by source and text, worst fail rate first, ignoring unanswered items', () => {
    const stats = checkStats([
      item({ text: 'Exits clear', result: 'pass' }),
      item({ text: 'Exits clear', result: 'fail' }),
      item({ text: 'Extinguisher tagged', result: 'fail' }),
      item({ text: 'Extinguisher tagged', result: 'na' }),
      item({ text: 'Exits clear', result: 'pass', source: 'Other' }),
      item({ text: 'Lights', result: '' }),
    ])
    expect(stats).toEqual([
      { source: 'Template', text: 'Extinguisher tagged', checks: 1, fails: 1, failRate: 100 },
      { source: 'Template', text: 'Exits clear', checks: 2, fails: 1, failRate: 50 },
      { source: 'Other', text: 'Exits clear', checks: 1, fails: 0, failRate: 0 },
    ])
  })
})

describe('readingStats', () => {
  it('summarises numbers oldest-first and takes the range from the latest run', () => {
    const [r] = readingStats([
      item({ kind: 'number', text: 'Fridge', value: '7', result: 'fail', checkedAt: day(3), maxValue: 5, unit: '°C' }),
      item({ kind: 'number', text: 'Fridge', value: '3', result: 'pass', checkedAt: day(1), maxValue: 5, unit: '°C' }),
      item({ kind: 'number', text: 'Fridge', value: '4', result: 'pass', checkedAt: day(2), maxValue: 4, unit: '°C' }),
      item({ kind: 'number', text: 'Fridge', value: 'abc', checkedAt: day(4) }),
    ])
    expect(r).toMatchObject({ count: 3, outOfRange: 1, low: 3, high: 7, average: 4.7, unit: '°C', maxValue: 5 })
    expect(r.recent.map((p) => p.value)).toEqual([3, 4, 7])
    expect(r.recent[2].fail).toBe(true)
  })

  it('uses the latest run with a usable value for range and unit', () => {
    const [r] = readingStats([
      item({ kind: 'number', value: '1', checkedAt: day(1), minValue: 0, maxValue: 5, unit: '°C' }),
      item({ kind: 'number', value: '2', checkedAt: day(2), minValue: 0, maxValue: 8, unit: '°C' }),
    ])
    expect(r).toMatchObject({ minValue: 0, maxValue: 8, unit: '°C' })
  })
})

describe('actionStats', () => {
  it('counts open, overdue, raised and closed actions and the average time to close', () => {
    const now = day(10)
    const since = day(5)
    const open = [item({ result: 'fail', actionDueDate: day(9) }), item({ result: 'fail', actionDueDate: day(12) })]
    const recent = [
      item({ result: 'fail', checkedAt: day(6), actionClosedAt: day(8) }),
      item({ result: 'fail', checkedAt: day(1), actionClosedAt: day(7) }),
      item({ result: 'fail', checkedAt: day(9) }),
      item({ result: 'pass', checkedAt: day(9) }),
    ]
    expect(actionStats(open, recent, since, now)).toEqual({
      openNow: 2,
      overdueNow: 1,
      raisedInWindow: 2,
      closedInWindow: 2,
      avgDaysToClose: 4,
    })
  })

  it('has no average when nothing closed', () => {
    expect(actionStats([], [], day(1), day(2)).avgDaysToClose).toBeNull()
  })
})
