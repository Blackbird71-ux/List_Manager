import { z } from 'zod'

// Answer types for template and checklist items. "check" is a plain tick box;
// the others tick themselves once answered. Any kind can also require a photo.
export const ITEM_KINDS = ['check', 'number', 'text', 'signature'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  check: 'Tick box',
  number: 'Number / reading',
  text: 'Text answer',
  signature: 'Signature',
}

// A signature is a small PNG drawn in the browser.
export const SIGNATURE_PREFIX = 'data:image/png;base64,'
export const MAX_SIGNATURE_LENGTH = 200_000
export const MAX_TEXT_ANSWER = 2000

const bound = z.number().finite().nullish()

// zod fields shared by every route that accepts item type settings.
export const itemTypeFields = {
  kind: z.enum(ITEM_KINDS).optional(),
  unit: z.string().trim().max(20).optional(),
  minValue: bound,
  maxValue: bound,
  photoRequired: z.boolean().optional(),
}

export interface ItemTypeSettings {
  kind: ItemKind
  unit: string
  minValue: number | null
  maxValue: number | null
  photoRequired: boolean
}

// Fill defaults and drop settings that don't apply: unit and range belong to
// number items only, and a reversed range is swapped.
export function normalizeItemType(input: {
  kind?: string | null
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  photoRequired?: boolean | null
}): ItemTypeSettings {
  const kind: ItemKind = (ITEM_KINDS as readonly string[]).includes(input.kind ?? '')
    ? (input.kind as ItemKind)
    : 'check'
  let min = kind === 'number' ? (input.minValue ?? null) : null
  let max = kind === 'number' ? (input.maxValue ?? null) : null
  if (min !== null && max !== null && min > max) [min, max] = [max, min]
  return {
    kind,
    unit: kind === 'number' ? (input.unit ?? '').trim() : '',
    minValue: min,
    maxValue: max,
    photoRequired: !!input.photoRequired,
  }
}

// A reading as typed ("12.5", " -3 ", "1,000"), or null if it isn't a number.
export function parseNumber(value: string): number | null {
  const v = value.trim().replace(/,/g, '')
  if (!v || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Pass/fail for a number reading against its range; '' when there is no range.
export function numberResult(
  value: string,
  minValue: number | null,
  maxValue: number | null
): '' | 'pass' | 'fail' {
  if (minValue === null && maxValue === null) return ''
  const n = parseNumber(value)
  if (n === null) return ''
  if (minValue !== null && n < minValue) return 'fail'
  if (maxValue !== null && n > maxValue) return 'fail'
  return 'pass'
}

// "2–8 °C", "≥ 10 psi", "≤ 5"; '' when there is no range.
export function rangeLabel(minValue: number | null, maxValue: number | null, unit = ''): string {
  const u = unit ? ` ${unit}` : ''
  if (minValue !== null && maxValue !== null) return `${minValue}–${maxValue}${u}`
  if (minValue !== null) return `≥ ${minValue}${u}`
  if (maxValue !== null) return `≤ ${maxValue}${u}`
  return ''
}

// Check a typed answer; returns an error message, or null if it is acceptable.
export function validateValue(kind: ItemKind, value: string): string | null {
  if (!value) return null
  if (kind === 'check') return 'This item is a tick box and takes no answer'
  if (kind === 'number' && parseNumber(value) === null) return 'Enter a number'
  if (kind === 'text' && value.length > MAX_TEXT_ANSWER) return 'Answer is too long'
  if (kind === 'signature') {
    if (!value.startsWith(SIGNATURE_PREFIX)) return 'Invalid signature'
    if (value.length > MAX_SIGNATURE_LENGTH) return 'Signature is too large'
  }
  return null
}
