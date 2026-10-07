import { describe, expect, it } from 'vitest'
import {
  attachmentsToUpload,
  dbBackupName,
  driveQueryString,
  snapshotsToPrune,
} from '@/lib/drive-backup-utils'

describe('dbBackupName', () => {
  it('uses a sortable UTC timestamp', () => {
    expect(dbBackupName(new Date('2026-10-08T03:30:05Z'))).toBe('listsmanager-20261008T033005.db.gz')
  })
})

describe('snapshotsToPrune', () => {
  const f = (name: string) => ({ id: name, name })

  it('keeps the newest N and returns the older ones', () => {
    const files = [
      f('listsmanager-20261001T030000.db.gz'),
      f('listsmanager-20261003T030000.db.gz'),
      f('listsmanager-20261002T030000.db.gz'),
    ]
    expect(snapshotsToPrune(files, 2).map((x) => x.name)).toEqual(['listsmanager-20261001T030000.db.gz'])
  })

  it('never selects files that are not snapshots', () => {
    const files = [f('notes.txt'), f('listsmanager-20261001T030000.db.gz')]
    expect(snapshotsToPrune(files, 0).map((x) => x.name)).toEqual(['listsmanager-20261001T030000.db.gz'])
  })

  it('returns nothing when under the limit', () => {
    expect(snapshotsToPrune([f('listsmanager-20261001T030000.db.gz')], 30)).toEqual([])
  })
})

describe('attachmentsToUpload', () => {
  it('returns only files missing from Drive', () => {
    expect(attachmentsToUpload(['a.pdf', 'b.png', 'c.txt'], new Set(['b.png']))).toEqual(['a.pdf', 'c.txt'])
  })
})

describe('driveQueryString', () => {
  it('escapes quotes and backslashes', () => {
    expect(driveQueryString("it's a\\b")).toBe("it\\'s a\\\\b")
  })
})
