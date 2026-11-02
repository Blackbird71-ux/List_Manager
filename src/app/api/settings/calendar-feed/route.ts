import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { baseUrl } from '@/lib/drive-backup'
import { newFeedToken } from '@/lib/calendar'

// Per-user iCal feed link. Own record only. The token is returned once, on
// creation; afterwards only whether a link is active (and since when).
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { calendarTokenCreatedAt: true },
  })
  return NextResponse.json({ createdAt: user?.calendarTokenCreatedAt ?? null })
}

/** Create a feed link, replacing (and so revoking) any previous one. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { token, hash } = newFeedToken()
  const createdAt = new Date()
  await prisma.user.update({
    where: { id: session.user.id },
    data: { calendarTokenHash: hash, calendarTokenCreatedAt: createdAt },
  })
  return NextResponse.json({ url: `${baseUrl(request)}/api/calendar/feed/${token}.ics`, createdAt })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await prisma.user.update({
    where: { id: session.user.id },
    data: { calendarTokenHash: null, calendarTokenCreatedAt: null },
  })
  return NextResponse.json({ createdAt: null })
}
