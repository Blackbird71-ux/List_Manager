import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { buildAuthUrl, getDriveConfig, redirectUriFor } from '@/lib/drive-backup'
import { requirePrimaryAdmin } from '../guard'

export const dynamic = 'force-dynamic'

// Returns the Google consent URL (fetched, not navigated to, so errors show on screen).
// A random state is also set as a cookie and checked by the callback (CSRF guard).
export async function GET(request: Request) {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied

  const config = await getDriveConfig()
  if (!config?.clientId || !config.clientSecret) {
    return NextResponse.json({ error: 'Save the Google client ID and secret first' }, { status: 400 })
  }

  const redirectUri = redirectUriFor(request)
  const state = randomBytes(16).toString('hex')
  const res = NextResponse.json({ url: buildAuthUrl(config, redirectUri, state) })
  res.cookies.set('lm-drive-state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: redirectUri.startsWith('https'),
    maxAge: 600,
    path: '/api/settings/drive-backup',
  })
  return res
}
