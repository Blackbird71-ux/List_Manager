import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn((args: unknown) => args),
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    checklistItem: { findMany: db.findMany, updateMany: db.updateMany },
    $transaction: db.$transaction,
  },
}))

import { syncItemDueDates, withoutHiddenItems } from '@/lib/checklist-helpers'

beforeEach(() => vi.clearAllMocks())

describe('withoutHiddenItems', () => {
  it('drops items hidden by a condition and keeps the rest', async () => {
    db.findMany.mockResolvedValue([
      { id: 'q', result: 'pass', conditionItemId: null, conditionResult: '' },
      { id: 'why', result: '', conditionItemId: 'q', conditionResult: 'fail' },
    ])
    const out = await withoutHiddenItems([
      { id: 'why', checklistId: 'A' },
      { id: 'other', checklistId: 'B' },
    ])
    expect(out.map((i) => i.id)).toEqual(['other'])
    expect(db.findMany.mock.calls[0][0].where.checklistId).toEqual({ in: ['A', 'B'] })
  })

  it('skips the lookup when there is nothing to filter', async () => {
    expect(await withoutHiddenItems([])).toEqual([])
    expect(db.findMany).not.toHaveBeenCalled()
  })
})

describe('syncItemDueDates', () => {
  it('moves each offset group to the new list due date', async () => {
    db.findMany.mockResolvedValue([{ dueOffsetDays: 0 }, { dueOffsetDays: 2 }])
    const due = new Date('2026-11-10T00:00:00.000Z')
    await syncItemDueDates('A', due)
    expect(db.updateMany.mock.calls.map((c) => c[0])).toEqual([
      { where: { checklistId: 'A', dueOffsetDays: 0 }, data: { dueDate: due } },
      { where: { checklistId: 'A', dueOffsetDays: 2 }, data: { dueDate: new Date('2026-11-08T00:00:00.000Z') } },
    ])
  })

  it('clears offset item dates when the list loses its due date, and does nothing without offsets', async () => {
    db.findMany.mockResolvedValueOnce([{ dueOffsetDays: 1 }])
    await syncItemDueDates('A', null)
    expect(db.updateMany.mock.calls[0][0].data).toEqual({ dueDate: null })

    db.findMany.mockResolvedValueOnce([])
    await syncItemDueDates('A', new Date())
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})
