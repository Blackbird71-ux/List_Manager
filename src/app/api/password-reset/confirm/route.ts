import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const schema = z.object({
  token: z.string().min(32).max(200),
  password: z.string().min(8).max(200),
})

// Deliberately public (with user sign-off): the caller proves identity with
// the one-time token from the reset email, not a session.
export async function POST(request: Request) {
  // Throttle token guessing (the token is unguessable anyway, but cheap belt
  // and braces).
  if (!rateLimit(`pw-confirm:${clientIp(request)}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
  const user = await prisma.user.findFirst({
    where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } },
    select: { id: true },
  })
  if (!user) {
    return NextResponse.json(
      { error: 'This reset link is invalid or has expired. Request a new one.' },
      { status: 400 }
    )
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(parsed.data.password, 12),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  })
  return NextResponse.json({ ok: true })
}
