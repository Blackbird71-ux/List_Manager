import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

// Admin: send a test email to the signed-in admin's own address.
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin' || !session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await sendEmail({
    to: session.user.email,
    subject: 'Lists Manager — test email',
    html: '<p>Email is working. Password-reset links will be sent from this address.</p>',
  })
  if (!result.ok) {
    return NextResponse.json({ error: `Send failed: ${result.error}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true, to: session.user.email })
}
