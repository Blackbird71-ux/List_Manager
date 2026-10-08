import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '@/lib/template-history'

describe('buildSnapshot', () => {
  it('keeps items in order and parses dropdown options', () => {
    const snap = buildSnapshot({
      items: [
        { text: 'a', priority: 'high', section: 'S', indent: 0, conditionIndex: null, conditionResult: '', dueOffsetDays: 2 },
        { text: 'b', priority: null, section: 'S', indent: 1, conditionIndex: 0, conditionResult: 'fail', dueOffsetDays: null },
      ],
      customFields: [{ name: 'Site', type: 'dropdown', options: '["N","S"]', required: true }],
    })
    expect(snap.items.map((i) => i.text)).toEqual(['a', 'b'])
    expect(snap.items[1]).toMatchObject({ conditionIndex: 0, conditionResult: 'fail' })
    expect(snap.customFields[0].options).toEqual(['N', 'S'])
  })

  it('tolerates malformed option JSON', () => {
    const snap = buildSnapshot({
      items: [],
      customFields: [{ name: 'x', type: 'text', options: 'oops', required: false }],
    })
    expect(snap.customFields[0].options).toEqual([])
  })
})
