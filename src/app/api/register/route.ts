import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
})

// Bootstrap only: open while no users exist, creating the first (admin)
// account. Once any user exists this route is closed — the admin creates
// further accounts via /api/users. Deliberately public with user sign-off.
export async function POST(request: Request) {
  const userCount = await prisma.user.count()
  if (userCount > 0) {
    return NextResponse.json({ error: 'Registration is closed' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { name, email, password } = parsed.data
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: 'admin',
    },
    select: { id: true, name: true, email: true, role: true },
  })

  return NextResponse.json({ user }, { status: 201 })
}

// Lets the login page decide whether to show the bootstrap form.
export async function GET() {
  const userCount = await prisma.user.count()
  return NextResponse.json({ open: userCount === 0 })
}
