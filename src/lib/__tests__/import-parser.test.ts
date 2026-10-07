import { describe, expect, it } from 'vitest'
import { parseCsv, parseRows, parseTextList } from '@/lib/import-parser'

describe('parseTextList', () => {
  it('reads a flat bullet list', () => {
    const d = parseTextList('•\tland ownership confirmation\n•\tGas testing\n \n•\tOther.')
    expect(d.items.map((i) => i.text)).toEqual(['land ownership confirmation', 'Gas testing', 'Other.'])
    expect(d.items.every((i) => i.section === '')).toBe(true)
  })

  it('turns numbered headings into sections and sub-bullets into subtasks', () => {
    const d = parseTextList(
      [
        'Intro paragraph that is skipped.',
        '________________________________________',
        '2) Set up governance',
        '•\t Define who approves:',
        '•\tscope changes,',
        '•\tbudget decisions,',
        '•\tpractical completion.',
        '•\t Create a risk register.',
        '3) Site due diligence',
        '•\t Generate a VicPlan report.',
      ].join('\n')
    )
    expect(d.items).toEqual([
      { text: 'Define who approves', section: 'Set up governance', indent: 0 },
      { text: 'scope changes', section: 'Set up governance', indent: 1 },
      { text: 'budget decisions', section: 'Set up governance', indent: 1 },
      { text: 'practical completion', section: 'Set up governance', indent: 1 },
      { text: 'Create a risk register.', section: 'Set up governance', indent: 0 },
      { text: 'Generate a VicPlan report.', section: 'Site due diligence', indent: 0 },
    ])
  })

  it('treats numbered lines as items when there are no bullets, and skips prose', () => {
    const d = parseTextList(
      [
        'Tennis building - Demolished.',
        'How can we improve this as we are the same team?',
        '1.\tCancellation of Kitchen registration',
        '•\tRisk,',
        '2.\tCancel Security arrangement',
        'Backflow',
        'Grease traps',
        'Risk,',
        '&',
      ].join('\n')
    )
    expect(d.items.map((i) => i.text)).toEqual([
      'Cancellation of Kitchen registration',
      'Cancel Security arrangement',
      'Backflow',
      'Grease traps',
    ])
  })
})

describe('parseRows', () => {
  it('uses the first filled cell as the item and lifts form labels into fields', () => {
    const d = parseRows([
      [null, null],
      ['Building Name', null],
      ['Date of inspection', null],
      ['Gas', null],
      ['Pest control', 'White ants:', 'Vermin:'],
      ['Completed by:', null],
    ])
    expect(d.fields).toEqual(['Building Name', 'Date of inspection', 'Completed by'])
    expect(d.items.map((i) => i.text)).toEqual(['Gas', 'Pest control'])
  })

  it('skips a SharePoint column-header row', () => {
    const d = parseRows([['Title', 'Column1', 'Item Type'], ['Gas', null, 'Item']])
    expect(d.items.map((i) => i.text)).toEqual(['Gas'])
  })
})

describe('parseCsv', () => {
  it('handles quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c"\r\n"say ""hi""",d\r\n')).toEqual([
      ['a', 'b, c'],
      ['say "hi"', 'd'],
    ])
  })
})
