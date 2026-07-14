import { prisma } from '@/lib/prisma'

export async function notify(
  userId: string,
  title: string,
  body: string,
  checklistId?: string
): Promise<void> {
  await prisma.notification.create({
    data: { userId, title, body, checklistId },
  })
}
