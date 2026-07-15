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

/**
 * Users mentioned in a comment: case-insensitive `@` + full name, or `@` +
 * first name when that first name is unique among the given users.
 */
function findMentionedUserIds(body: string, users: { id: string; name: string }[]): string[] {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hasToken = (token: string) =>
    token.length > 0 && new RegExp(`@${esc(token)}(?!\\w)`, 'i').test(body)

  const firstWordCounts = new Map<string, number>()
  for (const u of users) {
    const first = u.name.trim().split(/\s+/)[0].toLowerCase()
    firstWordCounts.set(first, (firstWordCounts.get(first) ?? 0) + 1)
  }

  const mentioned: string[] = []
  for (const u of users) {
    const full = u.name.trim()
    const first = full.split(/\s+/)[0]
    if (hasToken(full) || (firstWordCounts.get(first.toLowerCase()) === 1 && hasToken(first))) {
      mentioned.push(u.id)
    }
  }
  return mentioned
}

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
    select: {
      title: true,
      visibility: true,
      createdById: true,
      assignedToId: true,
      shares: { select: { userId: true } },
      items: { select: { assignedToId: true } },
    },
  })
  if (checklist) {
    // @mentions: match against users who can access this checklist.
    const allUsers = await prisma.user.findMany({ select: { id: true, name: true, role: true } })
    const sharedIds = new Set(checklist.shares.map((s) => s.userId))
    const itemAssigneeIds = new Set(
      checklist.items.map((i) => i.assignedToId).filter((uid): uid is string => Boolean(uid))
    )
    const accessibleUsers = allUsers.filter(
      (u) =>
        u.role === 'admin' ||
        u.role === 'manager' ||
        checklist.visibility === 'team' ||
        u.id === checklist.createdById ||
        u.id === checklist.assignedToId ||
        sharedIds.has(u.id) ||
        itemAssigneeIds.has(u.id)
    )
    const mentionedIds = new Set(
      findMentionedUserIds(parsed.data.body, accessibleUsers).filter(
        (uid) => uid !== session.user.id
      )
    )
    const excerpt =
      parsed.data.body.length > 120 ? `${parsed.data.body.slice(0, 117)}…` : parsed.data.body
    for (const userId of mentionedIds) {
      await notify(userId, `Mentioned by ${session.user.name}`, excerpt, id)
    }

    const recipients = new Set(
      [checklist.createdById, checklist.assignedToId].filter(
        (uid): uid is string =>
          uid != null && uid !== session.user.id && !mentionedIds.has(uid)
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
