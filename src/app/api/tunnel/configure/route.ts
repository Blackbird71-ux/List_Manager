import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { auth } from '@/lib/auth'
import { isPrimaryOrgAdmin } from '@/lib/access'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isPrimaryOrgAdmin(session.user.role, session.user.organizationId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
  } catch {
    return NextResponse.json({ error: 'Failed to write config — is /etc/cloudflared mounted and writable?' }, { status: 500 })
  }

  // Create the DNS CNAME (host -> <tunnelId>.cfargotunnel.com) from here so no
  // Cloudflare dashboard step is needed. tunnelId and host are regex-validated
  // above, so they are safe to interpolate.
  try {
    execSync(
      `cloudflared --origincert /etc/cloudflared/cert.pem tunnel route dns ${tunnelId} ${host} 2>&1`,
      { encoding: 'utf8', timeout: 30000 }
    )
    return NextResponse.json({ ok: true, dns: 'created' })
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    const msg = err.stdout ?? err.stderr ?? err.message ?? String(e)
    if (/already exists|already has/i.test(msg)) {
      return NextResponse.json({ ok: true, dns: 'exists' })
    }
    // Config was saved — the tunnel can still start; only the DNS record failed.
    return NextResponse.json({
      ok: true,
      dns: 'failed',
      dnsWarning: `Config saved, but creating the DNS record failed: ${msg.trim().slice(0, 300)}`,
    })
  }
}
