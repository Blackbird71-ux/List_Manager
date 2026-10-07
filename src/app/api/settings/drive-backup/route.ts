import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getDriveConfig,
  getDriveStatus,
  redirectUriFor,
  revokeToken,
  saveDriveConfig,
} from '@/lib/drive-backup'
import { requirePrimaryAdmin } from './guard'

export const dynamic = 'force-dynamic'

// Admin: connection state and last backup result. The client secret and
// refresh token are never returned to the browser.
export async function GET(request: Request) {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied

  const config = await getDriveConfig()
  return NextResponse.json({
    clientId: config?.clientId ?? '',
    hasSecret: Boolean(config?.clientSecret),
    connected: Boolean(config?.refreshToken),
    email: config?.email ?? null,
    redirectUri: redirectUriFor(request),
    last: await getDriveStatus(),
  })
}

// Save the Google OAuth client. A blank secret keeps the stored one. Changing the
// client invalidates any existing connection, so it is cleared.
const putSchema = z.object({
  clientId: z.string().trim().min(1).max(300),
  clientSecret: z.string().trim().max(300),
})

export async function PUT(request: Request) {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied

  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const existing = await getDriveConfig()
  const clientSecret = parsed.data.clientSecret || existing?.clientSecret
  if (!clientSecret) {
    return NextResponse.json({ error: 'Client secret is required' }, { status: 400 })
  }
  const unchanged = existing?.clientId === parsed.data.clientId && existing?.clientSecret === clientSecret
  await saveDriveConfig({
    clientId: parsed.data.clientId,
    clientSecret,
    ...(unchanged ? { refreshToken: existing?.refreshToken, email: existing?.email } : {}),
  })
  return NextResponse.json({ ok: true })
}

// Disconnect: revoke Google's grant and forget the token. Backups already on Drive stay.
export async function DELETE() {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied

  const config = await getDriveConfig()
  if (config) {
    if (config.refreshToken) await revokeToken(config.refreshToken)
    await saveDriveConfig({ clientId: config.clientId, clientSecret: config.clientSecret })
  }
  return NextResponse.json({ ok: true })
}
