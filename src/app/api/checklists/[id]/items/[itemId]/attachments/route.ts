import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MAX_ATTACHMENT_SIZE, saveAttachmentFile } from '@/lib/attachments'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, itemId } = await params
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, checklistId: id },
    select: { id: true },
  })
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return NextResponse.json({ error: 'File too large (10 MB max)' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const storagePath = await saveAttachmentFile(buffer, file.name)

  const attachment = await prisma.attachment.create({
    data: {
      itemId,
      fileName: file.name.slice(0, 255),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      storagePath,
      uploadedById: session.user.id,
    },
    select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
  })
  return NextResponse.json({ attachment }, { status: 201 })
}
