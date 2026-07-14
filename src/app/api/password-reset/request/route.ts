import { createHash, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSmtpConfig, sendEmail } from '@/lib/email'

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
})

// Per-email cooldown so the endpoint can't be used to mail-bomb someone.
const lastSent = new Map<string, number>()
const COOLDOWN_MS = 60_000

// Deliberately public (with user sign-off): this is the "Forgot password?"
// entry point, used precisely when the caller cannot log in. It never reveals
// whether an email has an account — the response is identical either way.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  if (!(await getSmtpConfig())) {
    return NextResponse.json(
      { error: 'Email is not set up on this server. Ask an admin to reset your password instead.' },
      { status: 503 }
    )
  }

  const { email } = parsed.data
  const generic = { ok: true, message: 'If that email has an account, a reset link has been sent.' }

  const last = lastSent.get(email)
  if (last && Date.now() - last < COOLDOWN_MS) {
    return NextResponse.json(generic)
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } })
  if (!user) {
    return NextResponse.json(generic)
  }

  const token = randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: createHash('sha256').update(token).digest('hex'),
      resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  })

  // Prefer the configured public URL over request headers so a spoofed Host
  // header can never end up in the emailed link.
  const origin =
    process.env.AUTH_URL?.replace(/\/$/, '') ||
    request.headers.get('origin') ||
    `http://${request.headers.get('host')}`
  const link = `${origin}/reset-password?token=${token}`

  const result = await sendEmail({
    to: email,
    subject: 'Lists Manager — password reset',
    html: `
      <p>Hi ${user.name},</p>
      <p>Someone (hopefully you) asked to reset your Lists Manager password.</p>
      <p><a href="${link}">Click here to choose a new password</a> — the link is valid for 30 minutes.</p>
      <p>If you didn't ask for this, you can ignore this email; your password is unchanged.</p>
    `,
  })
  if (!result.ok) {
    console.error('Password reset email failed:', result.error)
    return NextResponse.json(
      { error: 'Could not send the reset email. Ask an admin to reset your password instead.' },
      { status: 502 }
    )
  }

  lastSent.set(email, Date.now())
  return NextResponse.json(generic)
}
