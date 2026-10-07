import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const checklist = await prisma.checklist.findFirst({
    where: { id, ...checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId) },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!checklist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const template = await prisma.template.create({
    data: {
      title: checklist.title,
      description: checklist.description,
      category: checklist.category,
      recurrence: checklist.recurrence,
      requiresSignOff: checklist.requiresSignOff,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      items: {
        create: checklist.items.map((item, idx) => ({
          text: item.text,
          priority: item.priority,
          section: item.section,
          indent: item.indent,
          sortOrder: idx,
        })),
      },
    },
    select: { id: true },
  })
  return NextResponse.json({ id: template.id }, { status: 201 })
}
