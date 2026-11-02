import { describe, expect, it } from 'vitest'
import { normalizeItemType, numberResult, parseNumber, rangeLabel, validateValue } from '@/lib/item-types'

describe('normalizeItemType', () => {
  it('defaults to a tick box and drops number-only settings', () => {
    expect(normalizeItemType({})).toEqual({ kind: 'check', unit: '', minValue: null, maxValue: null, photoRequired: false })
    expect(normalizeItemType({ kind: 'text', unit: 'kg', minValue: 1, photoRequired: true })).toEqual({
      kind: 'text',
      unit: '',
      minValue: null,
      maxValue: null,
      photoRequired: true,
    })
    expect(normalizeItemType({ kind: 'bogus' }).kind).toBe('check')
  })

  it('keeps and orders a number range', () => {
    expect(normalizeItemType({ kind: 'number', unit: ' °C ', minValue: 8, maxValue: 2 })).toMatchObject({
      unit: '°C',
      minValue: 2,
      maxValue: 8,
    })
  })
})

describe('parseNumber', () => {
  it('reads plain readings and rejects junk', () => {
    expect(parseNumber(' 12.5 ')).toBe(12.5)
    expect(parseNumber('-3')).toBe(-3)
    expect(parseNumber('1,000')).toBe(1000)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('12abc')).toBeNull()
    expect(parseNumber('Infinity')).toBeNull()
  })
})

describe('numberResult', () => {
  it('passes inside the range (inclusive) and fails outside', () => {
    expect(numberResult('2', 2, 8)).toBe('pass')
    expect(numberResult('8', 2, 8)).toBe('pass')
    expect(numberResult('8.1', 2, 8)).toBe('fail')
    expect(numberResult('1', 2, null)).toBe('fail')
    expect(numberResult('100', null, 5)).toBe('fail')
  })

  it('gives no result without a range or a number', () => {
    expect(numberResult('5', null, null)).toBe('')
    expect(numberResult('x', 2, 8)).toBe('')
  })
})

describe('rangeLabel', () => {
  it('describes each kind of range', () => {
    expect(rangeLabel(2, 8, '°C')).toBe('2–8 °C')
    expect(rangeLabel(10, null, 'psi')).toBe('≥ 10 psi')
    expect(rangeLabel(null, 5)).toBe('≤ 5')
    expect(rangeLabel(null, null, 'kg')).toBe('')
  })
})

describe('validateValue', () => {
  it('accepts matching answers and an empty value', () => {
    expect(validateValue('number', '4.2')).toBeNull()
    expect(validateValue('text', 'All good')).toBeNull()
    expect(validateValue('signature', 'data:image/png;base64,AAAA')).toBeNull()
    expect(validateValue('check', '')).toBeNull()
  })

  it('rejects mismatched answers', () => {
    expect(validateValue('check', 'x')).toMatch(/tick box/)
    expect(validateValue('number', 'warm')).toBe('Enter a number')
    expect(validateValue('signature', 'data:text/html,hi')).toBe('Invalid signature')
    expect(validateValue('signature', 'data:image/png;base64,' + 'A'.repeat(200_000))).toMatch(/too large/)
  })
})
