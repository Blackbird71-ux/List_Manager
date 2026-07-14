import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Any signed-in user: list users for assignment dropdowns.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ users })
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'manager', 'member']).default('member'),
})

// Admin only: create an account for a colleague.
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

  const { name, email, password, role } = parsed.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
  }

  const user = await prisma.user.create({
    data: { name, email, password: await bcrypt.hash(password, 12), role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })
  return NextResponse.json({ user }, { status: 201 })
}
