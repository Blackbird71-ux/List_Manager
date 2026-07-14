import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { attachmentFilePath, deleteAttachmentFile } from '@/lib/attachments'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const attachment = await prisma.attachment.findUnique({ where: { id } })
  if (!attachment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const bytes = await readFile(attachmentFilePath(attachment.storagePath)).catch(() => null)
  if (!bytes) {
    return NextResponse.json({ error: 'File missing from storage' }, { status: 404 })
  }

  // Content-Disposition: attachment — uploaded HTML must never render in-origin.
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.size),
      'Content-Disposition': `attachment; filename="${attachment.fileName.replace(/[^\w.\- ]/g, '_')}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const attachment = await prisma.attachment.findUnique({ where: { id } })
  if (!attachment) {
    return NextResponse.json({ ok: true })
  }

  await prisma.attachment.delete({ where: { id } })
  await deleteAttachmentFile(attachment.storagePath)
  return NextResponse.json({ ok: true })
}
