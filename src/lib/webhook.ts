import { createHmac, randomBytes } from 'crypto'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { prisma } from '@/lib/prisma'

const KEY = 'webhook'
const TIMEOUT_MS = 5000

export interface WebhookConfig {
  url: string
  secret: string
}

export async function getWebhook(): Promise<WebhookConfig | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } })
    return row ? (JSON.parse(row.value) as WebhookConfig) : null
  } catch {
    return null
  }
}

export async function saveWebhook(url: string): Promise<WebhookConfig> {
  const existing = await getWebhook()
  const config = { url, secret: existing?.secret ?? randomBytes(24).toString('hex') }
  const value = JSON.stringify(config)
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } })
  return config
}

export async function clearWebhook() {
  await prisma.appSetting.deleteMany({ where: { key: KEY } })
}

/** True for loopback, private, link-local and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::' || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') ||
        v.startsWith('feb') || v.startsWith('fc') || v.startsWith('fd')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** Returns an error message when the URL is not an acceptable public https target. */
export async function checkWebhookUrl(raw: string): Promise<string | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'Enter a valid URL.'
  }
  if (url.protocol !== 'https:') return 'The webhook URL must start with https://.'
  if (url.username || url.password) return 'Do not put credentials in the URL.'
  try {
    const addresses = await lookup(url.hostname, { all: true })
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      return 'That address is not publicly reachable.'
    }
  } catch {
    return 'Could not resolve that host name.'
  }
  return null
}

/**
 * Post an event to the configured webhook, signed with HMAC-SHA256 in
 * X-ListsManager-Signature. Best effort: never throws, never follows redirects.
 * Only the primary organisation's events are sent, since the webhook is an
 * instance-wide setting owned by its admins.
 */
export async function sendWebhook(
  event: 'completed' | 'signed_off',
  checklistId: string
): Promise<void> {
  try {
    const config = await getWebhook()
    if (!config) return
    const checklist = await prisma.checklist.findFirst({
      where: { id: checklistId, organization: { isPrimary: true } },
      select: {
        id: true, title: true, dueDate: true, completedAt: true,
        signedOffByName: true, signedOffAt: true,
      },
    })
    if (!checklist) return
    if (await checkWebhookUrl(config.url)) return

    const body = JSON.stringify({ event, checklist, sentAt: new Date().toISOString() })
    const signature = createHmac('sha256', config.secret).update(body).digest('hex')
    await fetch(config.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'X-ListsManager-Signature': `sha256=${signature}` },
      body,
    })
  } catch (err) {
    console.error('Webhook failed:', err instanceof Error ? err.message : err)
  }
}
