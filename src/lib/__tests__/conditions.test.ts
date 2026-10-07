import { describe, expect, it } from 'vitest'
import { hiddenItemIds, offsetDueDate } from '../conditions'

describe('hiddenItemIds', () => {
  it('shows unconditional items', () => {
    expect(hiddenItemIds([{ id: 'a', result: '' }]).size).toBe(0)
  })

  it('hides a conditional item until the controller has the required result', () => {
    const items = [
      { id: 'a', result: '' },
      { id: 'b', result: '', conditionItemId: 'a', conditionResult: 'fail' },
    ]
    expect([...hiddenItemIds(items)]).toEqual(['b'])
    items[0].result = 'pass'
    expect([...hiddenItemIds(items)]).toEqual(['b'])
    items[0].result = 'fail'
    expect(hiddenItemIds(items).size).toBe(0)
  })

  it('hides dependants of a hidden controller', () => {
    const items = [
      { id: 'a', result: 'pass' },
      { id: 'b', result: 'fail', conditionItemId: 'a', conditionResult: 'fail' },
      { id: 'c', result: '', conditionItemId: 'b', conditionResult: 'fail' },
    ]
    expect([...hiddenItemIds(items)].sort()).toEqual(['b', 'c'])
  })

  it('leaves an item visible when its controller is gone or the chain loops', () => {
    expect(hiddenItemIds([{ id: 'a', result: '', conditionItemId: 'zz', conditionResult: 'fail' }]).size).toBe(0)
    const loop = [
      { id: 'a', result: 'fail', conditionItemId: 'b', conditionResult: 'fail' },
      { id: 'b', result: 'fail', conditionItemId: 'a', conditionResult: 'fail' },
    ]
    expect(hiddenItemIds(loop).size).toBe(0)
  })
})

describe('offsetDueDate', () => {
  it('counts days back from the list due date', () => {
    const due = new Date('2026-10-20T00:00:00Z')
    expect(offsetDueDate(due, 3)?.toISOString()).toBe('2026-10-17T00:00:00.000Z')
  })
  it('is null without a due date or offset', () => {
    expect(offsetDueDate(null, 3)).toBeNull()
    expect(offsetDueDate(new Date(), null)).toBeNull()
  })
})
