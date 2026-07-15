import { prisma } from '@/lib/prisma'

export const ALLOW_NEW_ORGS_KEY = 'allowNewOrgs'

/**
 * Instance-level toggle: can visitors create a brand-new organisation?
 * Absent (or anything but 'false') means yes — the original always-open
 * behaviour. Joining an existing organisation with its invite code is
 * always allowed regardless of this setting.
 */
export async function newOrgsAllowed(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: ALLOW_NEW_ORGS_KEY } })
  return row?.value !== 'false'
}
