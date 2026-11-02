import { describe, expect, it } from 'vitest'
import { STARTER_TEMPLATES, findStarters } from '@/lib/starter-templates'
import { normalizeItemType } from '@/lib/item-types'
import { isRecurrence } from '@/lib/recurrence'

describe('starter templates', () => {
  it('have unique keys and titles', () => {
    expect(new Set(STARTER_TEMPLATES.map((t) => t.key)).size).toBe(STARTER_TEMPLATES.length)
    expect(new Set(STARTER_TEMPLATES.map((t) => t.title)).size).toBe(STARTER_TEMPLATES.length)
  })

  it('fit the limits the template routes enforce', () => {
    for (const t of STARTER_TEMPLATES) {
      expect(t.title.length).toBeLessThanOrEqual(200)
      expect(t.description.length).toBeLessThanOrEqual(2000)
      expect(isRecurrence(t.recurrence)).toBe(true)
      expect(t.items.length).toBeGreaterThan(0)
      for (const item of t.items) {
        expect(item.text.length).toBeGreaterThan(0)
        expect(item.text.length).toBeLessThanOrEqual(500)
        expect((item.unit ?? '').length).toBeLessThanOrEqual(20)
      }
    }
  })

  it('keep their number ranges through normalisation', () => {
    const fridge = findStarters(['fridge-temps'])[0]
    const freezer = normalizeItemType(fridge.items.find((i) => i.text.startsWith('Freezer'))!)
    expect(freezer).toMatchObject({ kind: 'number', unit: '°C', minValue: -25, maxValue: -15 })
  })

  it('ignores unknown keys', () => {
    expect(findStarters(['nope', 'fire-safety']).map((t) => t.key)).toEqual(['fire-safety'])
  })
})
