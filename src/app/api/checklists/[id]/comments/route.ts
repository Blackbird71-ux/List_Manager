import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessChecklist } from '@/lib/access'
import { logActivity } from '@/lib/activity'
import { notify } from '@/lib/notifications'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const allowed = await canAccessChecklist(id, session.user.id, session.user.role)
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const comments = await prisma.comment.findMany({
    where: { checklistId: id },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true } } },
  })
  return NextResponse.json({ comments })
}

const createSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const allowed = await canAccessChecklist(id, session.user.id, session.user.role)
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const comment = await prisma.comment.create({
    data: { checklistId: id, authorId: session.user.id, body: parsed.data.body },
    include: { author: { select: { id: true, name: true } } },
  })

  logActivity(id, session.user.name, 'commented')

  // Let the people responsible for the checklist know (skip the author).
  const checklist = await prisma.checklist.findUnique({
    where: { id },
    select: { title: true, createdById: true, assignedToId: true },
  })
  if (checklist) {
    const recipients = new Set(
      [checklist.createdById, checklist.assignedToId].filter(
        (uid): uid is string => Boolean(uid) && uid !== session.user.id
      )
    )
    for (const userId of recipients) {
      await notify(
        userId,
        'New comment',
        `${session.user.name} commented on "${checklist.title}".`,
        id
      )
    }
  }

  return NextResponse.json({ comment }, { status: 201 })
}
