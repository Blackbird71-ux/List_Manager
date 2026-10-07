// Pure helpers for the Google Drive backup job (kept free of I/O so they can be tested).

export const DB_BACKUPS_TO_KEEP = 30

export interface RemoteFile {
  id: string
  name: string
}

/** "listsmanager-20261008T033000.db.gz" — sorts chronologically by name. */
export function dbBackupName(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
  return `listsmanager-${stamp}.db.gz`
}

/** Database snapshots to delete so only the newest `keep` remain. Other files are never touched. */
export function snapshotsToPrune(files: RemoteFile[], keep: number = DB_BACKUPS_TO_KEEP): RemoteFile[] {
  return files
    .filter((f) => /^listsmanager-\d{8}T\d{6}\.db\.gz$/.test(f.name))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(keep)
}

/** Local attachment files that are not on Drive yet (they are immutable, so name equality is enough). */
export function attachmentsToUpload(local: string[], remoteNames: Set<string>): string[] {
  return local.filter((name) => !remoteNames.has(name))
}

/** Escape a value for use inside a single-quoted Drive `q` search string. */
export function driveQueryString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
