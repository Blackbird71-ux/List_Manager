import QRCode from 'qrcode'
import { headers } from 'next/headers'

/** Public base URL for links printed on paper: APP_URL in production, else the host the page was asked on. */
export async function publicOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3400'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

/** QR code as an inline SVG string (black on white, quiet zone included). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
}
