import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { auth } from '@/lib/auth'
import { canSeeAllChecklists } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

function secretMatches(request: Request): boolean {
  const secret = process.env.DIGEST_SECRET
  if (!secret) return false
  const provided = request.headers.get('x-digest-secret') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Find all unsent reminders whose scheduledAt has passed and send them.
// Triggered by cron every 5 minutes or manually by an admin/manager.
async function handle(request: Request) {
  if (!secretMatches(request)) {
    const session = await auth()
    if (!session?.user?.id || !canSeeAllChecklists(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()

  // Due reminders for checklists that are still active.
  const reminders = await prisma.reminder.findMany({
    where: {
      sent: false,
      scheduledAt: { lte: now },
      checklist: { status: 'active' },
    },
    include: {
      checklist: { select: { id: true, title: true, dueDate: true } },
    },
  })

  const sent: string[] = []

  for (const reminder of reminders) {
    // Claim it first: a concurrent run (cron + manual trigger) must not
    // notify twice, so only the update that flips sent wins.
    const claimed = await prisma.reminder.updateMany({
      where: { id: reminder.id, sent: false },
      data: { sent: true, sentAt: now },
    })
    if (claimed.count === 0) continue

    await notify(
      reminder.userId,
      'Reminder: Checklist due soon',
      `"${reminder.checklist.title}" ${dueText(reminder.checklist.dueDate, now)}.`,
      reminder.checklistId
    ).catch((err) => console.error('Reminder notification failed:', err))

    sent.push(reminder.id)
  }

  return NextResponse.json({ sent: sent.length, ids: sent })
}

function dueText(dueDate: Date | null, now: Date): string {
  if (!dueDate) return 'is due soon'
  const diffMins = Math.round((dueDate.getTime() - now.getTime()) / 60000)
  if (diffMins <= 0) return 'is overdue'
  if (diffMins < 60) return `is due in ${diffMins} minute${diffMins === 1 ? '' : 's'}`
  const hours = Math.round(diffMins / 60)
  if (hours < 48) return `is due in ${hours} hour${hours === 1 ? '' : 's'}`
  return `is due in ${Math.round(hours / 24)} days`
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
