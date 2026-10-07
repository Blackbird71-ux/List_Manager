import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Per-user opt in/out of emailed due/overdue reminders. Own record only.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailReminders: true },
  })
  return NextResponse.json({ enabled: user?.emailReminders ?? true })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = z.object({ enabled: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await prisma.user.update({
    where: { id: session.user.id },
    data: { emailReminders: parsed.data.enabled },
  })
  return NextResponse.json({ enabled: parsed.data.enabled })
}
