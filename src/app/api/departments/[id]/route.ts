import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  // When present, replaces the member list wholesale.
  memberIds: z.array(z.string().min(1)).max(500).optional(),
})

// Admin only: rename a department and/or set its members.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const existing = await prisma.department.findFirst({
    where: { id, organizationId: session.user.organizationId },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { name, memberIds } = parsed.data

  if (memberIds !== undefined) {
    // Only users of the same organisation can be members.
    const validUsers = await prisma.user.findMany({
      where: { id: { in: memberIds }, organizationId: session.user.organizationId },
      select: { id: true },
    })
    await prisma.$transaction([
      prisma.departmentMember.deleteMany({ where: { departmentId: id } }),
      prisma.departmentMember.createMany({
        data: validUsers.map((u) => ({ departmentId: id, userId: u.id })),
      }),
    ])
  }

  if (name !== undefined) {
    try {
      await prisma.department.update({ where: { id }, data: { name } })
    } catch {
      return NextResponse.json(
        { error: 'A department with that name already exists' },
        { status: 409 }
      )
    }
  }

  const department = await prisma.department.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      members: { select: { user: { select: { id: true, name: true } } } },
    },
  })
  return NextResponse.json({ department })
}

// Admin only: delete a department. Checklists linked to it fall back to
// being invisible to members until re-targeted (links cascade-delete).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await prisma.department
    .deleteMany({ where: { id, organizationId: session.user.organizationId } })
    .catch((err) => console.error('Department delete failed:', err))
  return NextResponse.json({ ok: true })
}
