import { prisma } from '@/lib/prisma'
import { sendPushToUser } from '@/lib/webpush'
import { sendEmail } from '@/lib/email'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Due/overdue reminders are also emailed (when SMTP is configured and the user
// hasn't opted out). Never throws: email trouble must not break the caller.
async function emailReminder(userId: string, title: string, body: string, checklistId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, emailReminders: true },
  })
  if (!user?.emailReminders) return
  const origin = process.env.APP_URL?.replace(/\/$/, '')
  const link = origin && checklistId ? `${origin}/checklists/${checklistId}` : origin
  const result = await sendEmail({
    to: user.email,
    subject: `Lists Manager — ${title}`,
    html: `
      <p>Hi ${escapeHtml(user.name)},</p>
      <p>${escapeHtml(body)}</p>
      ${link ? `<p><a href="${link}">Open in Lists Manager</a></p>` : ''}
      <p style="color:#888;font-size:12px">You can turn these emails off in Settings.</p>
    `,
  })
  if (!result.ok && result.error !== 'SMTP is not configured') {
    console.error('Reminder email failed:', result.error)
  }
}

export async function notify(
  userId: string,
  title: string,
  body: string,
  checklistId?: string,
  options?: { email?: boolean }
): Promise<void> {
  await prisma.notification.create({
    data: { userId, title, body, checklistId },
  })
  // Fire-and-forget: a push failure must never break the caller.
  void sendPushToUser(userId, { title, body, checklistId }).catch((err) =>
    console.error('Push notification failed:', err)
  )
  if (options?.email) {
    void emailReminder(userId, title, body, checklistId).catch((err) =>
      console.error('Reminder email failed:', err)
    )
  }
}
