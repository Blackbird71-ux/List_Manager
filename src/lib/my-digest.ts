import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { formatInTz } from '@/lib/timezone'

const WINDOW_DAYS = 7

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type DigestRow = { title: string; dueDate: Date | null; href: string }

/** Overdue first, then soonest due. */
export function splitDigestRows(rows: DigestRow[], now: Date) {
  const overdue = rows.filter((r) => r.dueDate && r.dueDate < now)
  const upcoming = rows.filter((r) => !r.dueDate || r.dueDate >= now)
  const byDue = (a: DigestRow, b: DigestRow) =>
    (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity)
  return { overdue: overdue.sort(byDue), upcoming: upcoming.sort(byDue) }
}

function section(heading: string, rows: DigestRow[]): string {
  if (rows.length === 0) return ''
  const lines = rows
    .map((r) => {
      const due = r.dueDate
        ? ` — due ${formatInTz(r.dueDate, { day: 'numeric', month: 'short' })}`
        : ''
      const text = `${escapeHtml(r.title)}${due}`
      return `<li>${r.href ? `<a href="${r.href}">${text}</a>` : text}</li>`
    })
    .join('')
  return `<h3 style="margin:16px 0 4px">${heading} (${rows.length})</h3><ul>${lines}</ul>`
}

/**
 * Email each opted-in user a summary of the active lists and items assigned
 * to them that are overdue or due within the next week. Users with nothing to
 * report get no email. Uses the same opt-out as reminder emails.
 */
export async function runMyDigest(): Promise<{ sent: number }> {
  const now = new Date()
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const origin = process.env.APP_URL?.replace(/\/$/, '') ?? ''
  const link = (id: string) => (origin ? `${origin}/checklists/${id}` : '')

  const users = await prisma.user.findMany({
    where: { emailReminders: true },
    select: { id: true, name: true, email: true },
  })

  let sent = 0
  for (const user of users) {
    const [lists, items] = await Promise.all([
      prisma.checklist.findMany({
        where: { status: 'active', assignedToId: user.id, dueDate: { not: null, lte: horizon } },
        select: { id: true, title: true, dueDate: true },
      }),
      prisma.checklistItem.findMany({
        where: {
          assignedToId: user.id,
          checked: false,
          dueDate: { not: null, lte: horizon },
          checklist: { status: 'active' },
        },
        select: { text: true, dueDate: true, checklist: { select: { id: true, title: true } } },
      }),
    ])

    const listRows = splitDigestRows(
      lists.map((c) => ({ title: c.title, dueDate: c.dueDate, href: link(c.id) })),
      now
    )
    const itemRows = splitDigestRows(
      items.map((i) => ({
        title: `${i.text} (${i.checklist.title})`,
        dueDate: i.dueDate,
        href: link(i.checklist.id),
      })),
      now
    )
    const total =
      listRows.overdue.length + listRows.upcoming.length + itemRows.overdue.length + itemRows.upcoming.length
    if (total === 0) continue

    const result = await sendEmail({
      to: user.email,
      subject: `Lists Manager — your day: ${total} item${total === 1 ? '' : 's'} need attention`,
      html: `
        <p>Hi ${escapeHtml(user.name)},</p>
        ${section('Overdue lists', listRows.overdue)}
        ${section('Overdue items', itemRows.overdue)}
        ${section('Lists due in the next 7 days', listRows.upcoming)}
        ${section('Items due in the next 7 days', itemRows.upcoming)}
        <p style="color:#888;font-size:12px">You can turn these emails off in Settings.</p>
      `,
    })
    if (result.ok) sent++
    else if (result.error === 'SMTP is not configured') break
    else console.error('My digest email failed:', result.error)
  }
  return { sent }
}
