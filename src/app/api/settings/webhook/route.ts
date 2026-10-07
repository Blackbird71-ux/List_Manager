import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkWebhookUrl, clearWebhook, getWebhook, saveWebhook } from '@/lib/webhook'
import { requirePrimaryAdmin } from '../drive-backup/guard'

export const dynamic = 'force-dynamic'

// Primary-organisation admin: one outgoing webhook for completed / signed-off lists.
export async function GET() {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied
  const config = await getWebhook()
  return NextResponse.json({ url: config?.url ?? '', secret: config?.secret ?? '' })
}

const putSchema = z.object({ url: z.string().trim().min(1).max(500) })

export async function PUT(request: Request) {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied
  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const problem = await checkWebhookUrl(parsed.data.url)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const config = await saveWebhook(parsed.data.url)
  return NextResponse.json({ url: config.url, secret: config.secret })
}

export async function DELETE() {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied
  await clearWebhook()
  return NextResponse.json({ ok: true })
}
