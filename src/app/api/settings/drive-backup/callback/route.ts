import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import {
  baseUrl,
  exchangeCode,
  getDriveConfig,
  redirectUriFor,
  saveDriveConfig,
} from '@/lib/drive-backup'
import { requirePrimaryAdmin } from '../guard'

export const dynamic = 'force-dynamic'

function sameState(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

// Google redirects the admin's browser here after consent.
export async function GET(request: Request) {
  const back = (result: string) =>
    NextResponse.redirect(`${baseUrl(request)}/settings?drive=${result}`)

  if (await requirePrimaryAdmin()) return back('denied')

  const url = new URL(request.url)
  const cookie = request.headers.get('cookie') ?? ''
  const expected = /(?:^|;\s*)lm-drive-state=([^;]+)/.exec(cookie)?.[1] ?? ''
  const code = url.searchParams.get('code')
  if (url.searchParams.get('error') || !code || !sameState(url.searchParams.get('state') ?? '', expected)) {
    return back('error')
  }

  const config = await getDriveConfig()
  if (!config) return back('error')

  try {
    const { refreshToken, email } = await exchangeCode(config, code, redirectUriFor(request))
    await saveDriveConfig({ ...config, refreshToken, email })
  } catch (err) {
    console.error('Drive connect failed:', err)
    return back('error')
  }
  const res = back('connected')
  res.cookies.delete({ name: 'lm-drive-state', path: '/api/settings/drive-backup' })
  return res
}
