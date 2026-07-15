import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Any signed-in user: list their organisation's departments (for the
// visibility picker, user admin and My Team).
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const departments = await prisma.department.findMany({
    where: { organizationId: session.user.organizationId },
    select: {
      id: true,
      name: true,
      members: { select: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ departments })
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

// Admin only: create a department in their own organisation.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  try {
    const department = await prisma.department.create({
      data: { name: parsed.data.name, organizationId: session.user.organizationId },
      select: { id: true, name: true },
    })
    return NextResponse.json({ department }, { status: 201 })
  } catch {
    // @@unique([organizationId, name])
    return NextResponse.json(
      { error: 'A department with that name already exists' },
      { status: 409 }
    )
  }
}
