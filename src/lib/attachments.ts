import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10 MB

// Bytes live outside the DB: /data/attachments in the container, ./data locally.
function attachmentsDir(): string {
  return path.join(process.env.DATA_DIR ?? './data', 'attachments')
}

/** Write bytes to disk under a random name; returns the relative storage path. */
export async function saveAttachmentFile(buffer: Buffer, originalName: string): Promise<string> {
  const ext = path.extname(originalName).slice(0, 10)
  const name = `${randomBytes(16).toString('hex')}${ext}`
  await mkdir(attachmentsDir(), { recursive: true })
  await writeFile(path.join(attachmentsDir(), name), buffer)
  return name
}

export function attachmentFilePath(storagePath: string): string {
  // storagePath is a bare generated filename; basename() strips any
  // traversal a tampered DB row could contain.
  return path.join(attachmentsDir(), path.basename(storagePath))
}

export async function deleteAttachmentFile(storagePath: string): Promise<void> {
  await unlink(attachmentFilePath(storagePath)).catch((err) => {
    // Already-gone is fine (delete is idempotent); anything else is worth noting.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Attachment file delete failed:', err)
    }
  })
}
