import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { baseUrl } from '@/lib/drive-backup'
import { buildIcs, getCalendarEvents, hashFeedToken } from '@/lib/calendar'
import { clientIp, rateLimit } from '@/lib/rate-limit'

// Deliberately public (signed off): calendar apps can't log in, so the
// secret token in the URL stands in for the session. It resolves to one user
// and the feed shows exactly what that user can see on /calendar. Unknown
// tokens get a bare 404.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!rateLimit(`ical:${clientIp(request)}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params
  const raw = token.replace(/\.ics$/, '')
  if (!/^[0-9a-f]{48}$/.test(raw)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const user = await prisma.user.findUnique({
    where: { calendarTokenHash: hashFeedToken(raw) },
    select: { id: true, role: true, organizationId: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const events = await getCalendarEvents(user)
  return new NextResponse(buildIcs(events, baseUrl(request)), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="lists-manager.ics"',
      'Cache-Control': 'private, no-store',
    },
  })
}
