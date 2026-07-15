import { prisma } from '@/lib/prisma'
import { sendPushToUser } from '@/lib/webpush'

export async function notify(
  userId: string,
  title: string,
  body: string,
  checklistId?: string
): Promise<void> {
  await prisma.notification.create({
    data: { userId, title, body, checklistId },
  })
  // Fire-and-forget: a push failure must never break the caller.
  void sendPushToUser(userId, { title, body, checklistId }).catch((err) =>
    console.error('Push notification failed:', err)
  )
}
