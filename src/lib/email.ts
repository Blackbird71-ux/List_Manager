import nodemailer from 'nodemailer'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

// SMTP config lives in the AppSetting table (key "smtp"), edited by admins in
// Settings -> Email — never in .env files. Same pattern as HomeBase.
export const smtpSchema = z.object({
  host: z.string().trim().min(1).max(200),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim().min(1).max(200),
  pass: z.string().min(1).max(200),
  from: z.string().trim().max(200).default(''),
})

export type SmtpConfig = z.infer<typeof smtpSchema>

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: 'smtp' } })
    if (!row) return null
    const parsed = smtpSchema.safeParse(JSON.parse(row.value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const smtp = await getSmtpConfig()
  if (!smtp) return { ok: false, error: 'SMTP is not configured' }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    })
    await transporter.sendMail({ from: smtp.from || smtp.user, to, subject, html })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
