import path from 'node:path'
import os from 'node:os'
import { gzipSync } from 'node:zlib'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { prisma } from '@/lib/prisma'
import { attachmentsDir, attachmentFilePath } from '@/lib/attachments'
import {
  attachmentsToUpload,
  dbBackupName,
  driveQueryString,
  snapshotsToPrune,
  type RemoteFile,
} from '@/lib/drive-backup-utils'

// Nightly backup of the database and uploaded files to the admin's Google Drive.
// OAuth client id/secret and the refresh token live in the AppSetting table
// (edited under Settings -> Google Drive backup), never in .env files.
// Scope is drive.file, so the app can only see the folders it created itself.

const CONFIG_KEY = 'drive-backup'
const STATUS_KEY = 'drive-backup-status'
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email']
const ROOT_FOLDER = 'Lists Manager Backups'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveBackupConfig {
  clientId: string
  clientSecret: string
  refreshToken?: string
  email?: string
}

export interface DriveBackupStatus {
  at: string
  ok: boolean
  error?: string
  dbFile?: string
  attachmentsUploaded?: number
  attachmentsTotal?: number
}

async function readSetting<T>(key: string): Promise<T | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    return row ? (JSON.parse(row.value) as T) : null
  } catch {
    return null
  }
}

async function writeSetting(key: string, value: unknown) {
  const json = JSON.stringify(value)
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  })
}

export const getDriveConfig = () => readSetting<DriveBackupConfig>(CONFIG_KEY)
export const saveDriveConfig = (config: DriveBackupConfig) => writeSetting(CONFIG_KEY, config)
export const getDriveStatus = () => readSetting<DriveBackupStatus>(STATUS_KEY)

/** Public base URL (APP_URL in production) used for the OAuth redirect. */
export function baseUrl(request: Request): string {
  return (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, '')
}

export const redirectUriFor = (request: Request) =>
  `${baseUrl(request)}/api/settings/drive-backup/callback`

export function buildAuthUrl(config: DriveBackupConfig, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // always issue a refresh token
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Google token error (${res.status})`)
  return data as { access_token: string; refresh_token?: string }
}

/** Trade the one-time code for tokens and look up which Google account it is. */
export async function exchangeCode(config: DriveBackupConfig, code: string, redirectUri: string) {
  const tokens = await tokenRequest({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token — remove the app at myaccount.google.com/permissions and connect again.')
  }
  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const email = info.ok ? ((await info.json()) as { email?: string }).email : undefined
  return { refreshToken: tokens.refresh_token, email }
}

export async function revokeToken(token: string) {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined)
}

async function driveJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google Drive ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

async function findFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  const q = [
    `name='${driveQueryString(name)}'`,
    `mimeType='${FOLDER_MIME}'`,
    'trashed=false',
    ...(parentId ? [`'${parentId}' in parents`] : []),
  ].join(' and ')
  const data = await driveJson<{ files: RemoteFile[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '1' })}`
  )
  return data.files[0]?.id ?? null
}

async function ensureFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const existing = await findFolder(accessToken, name, parentId)
  if (existing) return existing
  const created = await driveJson<{ id: string }>(accessToken, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  })
  return created.id
}

async function listFiles(accessToken: string, folderId: string): Promise<RemoteFile[]> {
  const out: RemoteFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name)',
      pageSize: '1000',
      ...(pageToken ? { pageToken } : {}),
    })
    const data = await driveJson<{ files: RemoteFile[]; nextPageToken?: string }>(
      accessToken,
      `https://www.googleapis.com/drive/v3/files?${params}`
    )
    out.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

async function uploadFile(accessToken: string, folderId: string, name: string, body: Buffer) {
  const boundary = `lm${Date.now().toString(36)}`
  const meta = JSON.stringify({ name, parents: [folderId] })
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  await driveJson(accessToken, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(payload),
  })
}

async function deleteFile(accessToken: string, fileId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404) throw new Error(`Google Drive ${res.status} deleting old backup`)
}

/** Consistent snapshot of the live SQLite DB (safe with WAL), gzipped. */
async function snapshotDatabase(): Promise<Buffer> {
  const dbPath = (process.env.DATABASE_URL ?? 'file:/data/listsmanager.db').replace(/^file:/, '')
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lm-backup-'))
  const tmp = path.join(dir, 'snapshot.db')
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    await db.backup(tmp)
  } finally {
    db.close()
  }
  try {
    return gzipSync(await readFile(tmp))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

let running = false

/** Upload tonight's DB snapshot, any new attachments, and prune old snapshots. Never throws. */
export async function runDriveBackup(): Promise<DriveBackupStatus> {
  if (running) return { at: new Date().toISOString(), ok: false, error: 'A backup is already running' }
  running = true
  const status: DriveBackupStatus = { at: new Date().toISOString(), ok: false }
  try {
    const config = await getDriveConfig()
    if (!config?.refreshToken) throw new Error('Google Drive is not connected')

    const { access_token: accessToken } = await tokenRequest({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    })

    const rootId = await ensureFolder(accessToken, ROOT_FOLDER)
    const dbFolder = await ensureFolder(accessToken, 'database', rootId)
    const attFolder = await ensureFolder(accessToken, 'attachments', rootId)

    const name = dbBackupName(new Date())
    await uploadFile(accessToken, dbFolder, name, await snapshotDatabase())
    status.dbFile = name

    // Attachments are immutable, randomly named files — upload whatever Drive lacks.
    const local = await readdir(attachmentsDir()).catch(() => [] as string[])
    const remote = new Set((await listFiles(accessToken, attFolder)).map((f) => f.name))
    const missing = attachmentsToUpload(local, remote)
    for (const file of missing) {
      await uploadFile(accessToken, attFolder, file, await readFile(attachmentFilePath(file)))
    }
    status.attachmentsUploaded = missing.length
    status.attachmentsTotal = local.length

    for (const old of snapshotsToPrune(await listFiles(accessToken, dbFolder))) {
      await deleteFile(accessToken, old.id)
    }
    status.ok = true
  } catch (err) {
    status.error = err instanceof Error ? err.message : 'Backup failed'
    console.error('Drive backup failed:', err)
  } finally {
    running = false
    await writeSetting(STATUS_KEY, status).catch(() => undefined)
  }
  return status
}
