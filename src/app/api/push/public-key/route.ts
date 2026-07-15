import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVapidConfig } from '@/lib/webpush'

export const dynamic = 'force-dynamic'

// VAPID public key for the browser's pushManager.subscribe().
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { publicKey } = await getVapidConfig()
  return NextResponse.json({ publicKey })
}
