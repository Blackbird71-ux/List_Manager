import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { copyFileSync, existsSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { auth } from '@/lib/auth'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return new Promise<NextResponse>((resolve) => {
    let url = ''
    let resolved = false

    const child = spawn('cloudflared', ['--origincert', '/etc/cloudflared/cert.pem', 'tunnel', 'login'])

    function captureUrl(data: Buffer) {
      const text = data.toString()
      console.log('[cloudflared login]', text.trim())
      const match = text.match(/https:\/\/\S+cloudflare\S+/i)
      if (match && !url) {
        url = match[0].replace(/[.,;)\]>]+$/, '')
        if (!resolved) {
          resolved = true
          resolve(NextResponse.json({ url }))
        }
      }
    }

    child.stdout.on('data', captureUrl)
    child.stderr.on('data', captureUrl)

    // cloudflared ignores --origincert for `tunnel login` and writes the cert
    // to ~/.cloudflared/cert.pem, which is not on the mounted volume. Move it
    // to /etc/cloudflared once login finishes so the wizard (and the tunnel)
    // can find it and it survives container recreates.
    child.on('exit', () => {
      const homeCert = join(homedir(), '.cloudflared', 'cert.pem')
      try {
        if (existsSync(homeCert) && !existsSync('/etc/cloudflared/cert.pem')) {
          copyFileSync(homeCert, '/etc/cloudflared/cert.pem')
          unlinkSync(homeCert)
          console.log('[cloudflared login] moved cert to /etc/cloudflared/cert.pem')
        }
      } catch (err) {
        console.error('[cloudflared login] could not move cert:', err)
      }
    })

    child.on('error', () => {
      if (!resolved) {
        resolved = true
        resolve(NextResponse.json({ error: 'cloudflared not available — make sure you are running inside the Docker container.' }, { status: 500 }))
      }
    })

    // Fallback if URL not captured within 5 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        if (url) {
          resolve(NextResponse.json({ url }))
        } else {
          child.kill()
          resolve(NextResponse.json({ error: 'cloudflared did not return a login URL. Check container logs.' }, { status: 500 }))
        }
      }
    }, 5000)
  })
}
