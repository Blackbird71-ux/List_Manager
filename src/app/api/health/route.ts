import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public on purpose: Docker healthcheck target. Returns nothing but status.
export async function GET() {
  try {
    await prisma.user.count()
    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
