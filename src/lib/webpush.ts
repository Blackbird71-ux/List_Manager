import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

// VAPID keys live in the AppSetting table (key "webpush"), generated on first
// use — never in .env files. Same pattern as SMTP in src/lib/email.ts.
const VAPID_SUBJECT = 'mailto:mark.a.liddle@gmail.com'

type VapidConfig = { publicKey: string; privateKey: string }

export async function getVapidConfig(): Promise<VapidConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'webpush' } })
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as Partial<VapidConfig>
      if (parsed.publicKey && parsed.privateKey) {
        return { publicKey: parsed.publicKey, privateKey: parsed.privateKey }
      }
    } catch {
      // Fall through and regenerate.
    }
  }

  const keys = webpush.generateVAPIDKeys()
  const value = JSON.stringify(keys)
  await prisma.appSetting.upsert({
    where: { key: 'webpush' },
    create: { key: 'webpush', value },
    update: { value },
  })
  return keys
}

// Best-effort push to every device the user has subscribed. Dead
// subscriptions (404/410) are cleaned up; other failures are logged only —
// push must never break the caller.
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; checklistId?: string }
): Promise<void> {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } })
    if (subscriptions.length === 0) return

    const vapid = await getVapidConfig()
    const json = JSON.stringify(payload)

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            json,
            { vapidDetails: { subject: VAPID_SUBJECT, ...vapid } }
          )
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch((err) => console.error('Stale push subscription cleanup failed:', err))
          } else {
            console.error('Web push failed:', err)
          }
        }
      })
    )
  } catch (err) {
    console.error('Web push failed:', err)
  }
}
