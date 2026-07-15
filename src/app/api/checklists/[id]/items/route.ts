import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { logActivity } from '@/lib/activity'

const createSchema = z.object({
  text: z.string().trim().min(1).max(500),
  priority: z.enum(['low', 'medium', 'high']).nullish(),
  assignedToId: z.string().nullish(),
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

  const checklist = await prisma.checklist.findFirst({
    where: { id, ...checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId) },
    select: { id: true },
  })
  if (!checklist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // An item assignee must belong to the same organisation.
  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: parsed.data.assignedToId, organizationId: session.user.organizationId },
      select: { id: true },
    })
    if (!assignee) {
      return NextResponse.json({ error: 'Assignee not found' }, { status: 400 })
    }
  }

  const last = await prisma.checklistItem.findFirst({
    where: { checklistId: id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const item = await prisma.checklistItem.create({
    data: {
      checklistId: id,
      text: parsed.data.text,
      priority: parsed.data.priority ?? null,
      assignedToId: parsed.data.assignedToId ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
      },
    },
  })
  logActivity(id, session.user.name, 'item_added', parsed.data.text)
  return NextResponse.json({ item }, { status: 201 })
}
