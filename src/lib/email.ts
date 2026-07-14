import nodemailer from 'nodemailer'

// SMTP comes from the environment (.env.local — same credentials as HomeBase).
// Returns null when not configured so callers can degrade gracefully.
function smtpConfig() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT ?? 587)
  return { host, port, user, pass, from: process.env.SMTP_FROM || user }
}

export function emailConfigured(): boolean {
  return smtpConfig() !== null
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
  const smtp = smtpConfig()
  if (!smtp) return { ok: false, error: 'SMTP is not configured' }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    })
    await transporter.sendMail({ from: smtp.from, to, subject, html })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
