import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { MAX_ATTACHMENT_SIZE, saveAttachmentFile } from '@/lib/attachments'
import { logActivity } from '@/lib/activity'

// Supporting documents attached to the checklist as a whole.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const checklist = await prisma.checklist.findFirst({
    where: { id, ...checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId) },
    select: { id: true },
  })
  if (!checklist) {
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

  const storagePath = await saveAttachmentFile(Buffer.from(await file.arrayBuffer()), file.name)
  const attachment = await prisma.attachment.create({
    data: {
      checklistId: id,
      fileName: file.name.slice(0, 255),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      storagePath,
      uploadedById: session.user.id,
    },
    select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
  })
  logActivity(id, session.user.name, 'document_added', attachment.fileName)
  return NextResponse.json({ attachment }, { status: 201 })
}
