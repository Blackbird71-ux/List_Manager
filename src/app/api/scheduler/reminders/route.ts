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

  // Find due reminders and mark them sent
  const reminders = await prisma.reminder.findMany({
    where: {
      sent: false,
      scheduledAt: { lte: now },
    },
    include: {
      checklist: { select: { id: true, title: true } },
      user: { select: { id: true, email: true } },
    },
  })

  const sent: string[] = []

  for (const reminder of reminders) {
    // Mark as sent in the DB
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { sent: true, sentAt: now },
    })

    // Send notification to the user
    await notify(
      reminder.userId,
      'Reminder: Checklist due soon',
      `"${reminder.checklist.title}" is due ${(() => {
        const diff = reminder.scheduledAt.getTime() - now.getTime()
        const absDiff = Math.abs(diff)
        const hours = Math.floor(absDiff / 3600000)
        const mins = Math.floor((absDiff % 3600000) / 60000)
        if (hours > 0) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
        return mins === 0 ? 'now' : `${mins} minutes ago`
      })()}.`,
      reminder.checklistId
    ).catch(() => undefined)

    sent.push(reminder.id)
  }

  return NextResponse.json({ sent: sent.length, ids: sent })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
