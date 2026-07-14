import { NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import { auth } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const tunnelId = body?.tunnelId
  const hostname = body?.hostname

  if (!tunnelId || typeof tunnelId !== 'string' || !UUID_RE.test(tunnelId)) {
    return NextResponse.json({ error: 'Invalid tunnel ID — must be a UUID.' }, { status: 400 })
  }

  const host = typeof hostname === 'string' && hostname.trim() !== ''
    ? hostname.trim()
    : 'lists.liddleapps.com'
  if (!HOSTNAME_RE.test(host)) {
    return NextResponse.json({ error: 'Invalid hostname.' }, { status: 400 })
  }

  // Credentials file is named by UUID
  const config = `tunnel: ${tunnelId}
credentials-file: /etc/cloudflared/${tunnelId}.json

ingress:
  - hostname: ${host}
    service: http://localhost:3000
  - service: http_status:404
`
  try {
    writeFileSync('/etc/cloudflared/config.yml', config, 'utf8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to write config — is /etc/cloudflared mounted and writable?' }, { status: 500 })
  }
}
