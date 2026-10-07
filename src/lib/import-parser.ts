// Turns the lists people already have (pasted/saved text with bullets or
// numbering, CSV and Excel rows) into a draft template. Nothing is saved
// here — the draft is shown in the template editor for review first.

export interface ParsedItem {
  text: string
  section: string
}

export interface ParsedDraft {
  items: ParsedItem[]
  // Form-style labels (Building name, Completed by…) that belong on the
  // checklist as fill-in fields rather than as tick-boxes.
  fields: string[]
}

const MAX_ITEM_LENGTH = 500
const BULLET = /^(?:[•▪◦●○■□☐☑✓·]|[-*–—](?=\s))\s*(.+)$/u
const NUMBERED = /^\d+[.)]\s+(.+)$/
const RULE = /^[_\-=─*\s]{3,}$/
const FIELD_LABEL =
  /^(?:(?:building|site|facility)\s+)?(?:name|address|contact(?:\s+person)?)$|^date of inspection$|^(?:completed|inspected)\s+by$/i

function clip(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_LENGTH)
}

type Line = { kind: 'bullet' | 'numbered' | 'plain'; text: string }

function classify(raw: string[]): Line[] {
  const lines: Line[] = []
  for (const line of raw) {
    const t = line.replace(/^﻿/, '').trim()
    if (!t || RULE.test(t)) continue
    const bullet = BULLET.exec(t)
    if (bullet) {
      lines.push({ kind: 'bullet', text: clip(bullet[1]) })
      continue
    }
    const numbered = NUMBERED.exec(t)
    lines.push(numbered ? { kind: 'numbered', text: clip(numbered[1]) } : { kind: 'plain', text: clip(t) })
  }
  return lines
}

/**
 * Parse free text. Two layouts are recognised:
 *  - bullets under headings ("3) Site checks" then "• item" lines): headings
 *    become sections; a bullet ending in ":" followed by comma-separated
 *    bullets ("Define who approves:" / "scope," / "budget.") is merged into
 *    one item per sub-bullet.
 *  - a plain numbered or one-per-line list: each short line is an item.
 */
export function parseTextList(text: string): ParsedDraft {
  const lines = classify(text.split(/\r?\n/))
  // Bullet layout only when most lines are bullets; a few stray bullets in a
  // numbered list shouldn't turn its numbered lines into headings.
  const hasBullets = lines.filter((l) => l.kind === 'bullet').length * 2 > lines.length
  const items: ParsedItem[] = []
  let section = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (hasBullets && line.kind !== 'bullet') {
      // A heading is a numbered line, or a plain line leading into bullets.
      if (line.kind === 'numbered' || lines[i + 1]?.kind === 'bullet') section = line.text
      continue
    }

    if (!hasBullets && line.kind !== 'numbered') {
      // Without bullets, only short label-like lines are items; sentences are prose.
      if (line.text.length > 60 || /[.?:,&]$/.test(line.text)) continue
    }

    if (line.kind === 'bullet' && line.text.endsWith(':') && lines[i + 1]?.kind === 'bullet') {
      let j = i + 1
      const children: string[] = []
      while (lines[j]?.kind === 'bullet') {
        children.push(lines[j].text)
        j++
        if (!children[children.length - 1].endsWith(',')) break
      }
      for (const child of children) {
        items.push({ text: clip(`${line.text} ${child.replace(/[,.;]$/, '')}`), section })
      }
      i = j - 1
      continue
    }

    items.push({ text: line.text, section })
  }

  return { items, fields: [] }
}

/** Parse spreadsheet rows: the first filled cell of each row is the item. */
export function parseRows(rows: unknown[][]): ParsedDraft {
  const items: ParsedItem[] = []
  const fields: string[] = []
  for (const row of rows) {
    // SharePoint list exports start with a "Title … Item Type" column-header row.
    if (row[0] === 'Title' && row.includes('Item Type')) continue
    const first = row.map((c) => (c == null ? '' : String(c).trim())).find((c) => c !== '')
    if (!first) continue
    const label = clip(first)
    const name = label.replace(/:$/, '')
    if (FIELD_LABEL.test(name)) {
      if (!fields.includes(name)) fields.push(name)
    } else {
      items.push({ text: label, section: '' })
    }
  }
  return { items, fields }
}

/** Minimal RFC 4180 CSV reader (quoted fields, escaped quotes, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
