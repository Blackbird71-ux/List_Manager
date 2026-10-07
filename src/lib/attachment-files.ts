import { prisma } from '@/lib/prisma'
import { copyAttachmentFile, deleteAttachmentFile } from '@/lib/attachments'

/** Stored file names for every attachment on a checklist, its items included. */
export async function storagePathsForChecklist(checklistId: string): Promise<string[]> {
  const rows = await prisma.attachment.findMany({
    where: { OR: [{ checklistId }, { item: { checklistId } }] },
    select: { storagePath: true },
  })
  return rows.map((r) => r.storagePath)
}

/** Stored file names for an item's attachments and those of its subtasks (deleted with it). */
export async function storagePathsForItem(itemId: string): Promise<string[]> {
  const rows = await prisma.attachment.findMany({
    where: { OR: [{ itemId }, { item: { parentId: itemId } }] },
    select: { storagePath: true },
  })
  return rows.map((r) => r.storagePath)
}

/** Remove files from disk once their database rows are gone. */
export async function deleteStoredFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => deleteAttachmentFile(p)))
}

/**
 * Give a new run of a checklist its own copies of the checklist-level
 * supporting documents (item attachments are per-run evidence and stay behind).
 */
export async function copyChecklistAttachments(fromId: string, toId: string): Promise<void> {
  const docs = await prisma.attachment.findMany({ where: { checklistId: fromId } })
  for (const doc of docs) {
    try {
      const storagePath = await copyAttachmentFile(doc.storagePath)
      await prisma.attachment.create({
        data: {
          checklistId: toId,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          size: doc.size,
          storagePath,
          uploadedById: doc.uploadedById,
        },
      })
    } catch (err) {
      // A missing source file shouldn't block the new run being created.
      console.error('Copying checklist document failed:', err)
    }
  }
}
