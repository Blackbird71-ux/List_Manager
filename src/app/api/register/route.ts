import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(8).max(200),
    // Exactly one of these decides the mode: found a new organisation, or
    // join an existing one with its invite code.
    organizationName: z.string().trim().min(1).max(200).optional(),
    inviteCode: z.string().trim().toLowerCase().min(1).max(100).optional(),
  })
  .refine((v) => Boolean(v.organizationName) !== Boolean(v.inviteCode), {
    message: 'Provide either an organisation name or an invite code',
  })

// Public by design (user sign-off): registering with an organisation name
// creates a new organisation with this user as its admin; registering with
// an invite code joins that organisation as a member.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { name, email, password, organizationName, inviteCode } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 12)

  if (inviteCode) {
    const org = await prisma.organization.findUnique({
      where: { inviteCode },
      select: { id: true },
    })
    if (!org) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
    }
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role: 'member', organizationId: org.id },
      select: { id: true, name: true, email: true, role: true },
    })
    return NextResponse.json({ user }, { status: 201 })
  }

  // Create a new organisation; the first organisation on this install is
  // primary (its admins manage instance-level settings like email/tunnel).
  const orgCount = await prisma.organization.count()
  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: organizationName as string,
        inviteCode: randomBytes(6).toString('hex'),
        isPrimary: orgCount === 0,
      },
    })
    return tx.user.create({
      data: { name, email, password: hashed, role: 'admin', organizationId: org.id },
      select: { id: true, name: true, email: true, role: true },
    })
  })

  return NextResponse.json({ user }, { status: 201 })
}

// Lets the login page decide whether to show the registration form.
export async function GET() {
  return NextResponse.json({ open: true })
}
