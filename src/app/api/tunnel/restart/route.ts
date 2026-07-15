import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { auth } from '@/lib/auth'
import { isPrimaryOrgAdmin } from '@/lib/access'
import { inContainer, findCloudflaredPid, queryReady, METRICS_HOST, METRICS_PORT } from '@/lib/tunnel-health'

export const dynamic = 'force-dynamic'

/**
 * Restart the in-process tunnel by terminating the cloudflared process; the
 * supervisor loop in docker/entrypoint.sh respawns it within ~5 seconds.
 *
 * If no cloudflared is running at all, start one ourselves: the supervisor
 * only exists when config.yml was present at container boot, so on a
 * first-time wizard setup (config written after boot) there is no supervisor
 * and nothing would ever start the tunnel.
 */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isPrimaryOrgAdmin(session.user.role, session.user.organizationId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!(await inContainer())) {
    return NextResponse.json(
      { error: 'Not running in a container — tunnel control is unavailable in local dev.' },
      { status: 400 },
    )
  }

  const pid = await findCloudflaredPid()
  if (pid === null) {
    if (!existsSync('/etc/cloudflared/config.yml')) {
      return NextResponse.json({ error: 'Tunnel is not configured yet — finish the steps above first.' }, { status: 400 })
    }
    // First-time start (no supervisor). Detach so it outlives this request;
    // stdio inherit so cloudflared's logs land in the container logs. After
    // the next container restart the entrypoint supervisor takes over.
    const child = spawn('cloudflared', [
      'tunnel', '--no-autoupdate',
      '--metrics', `${METRICS_HOST}:${METRICS_PORT}`,
      '--config', '/etc/cloudflared/config.yml',
      'run',
    ], { detached: true, stdio: 'inherit' })
    child.unref()

    await new Promise((r) => setTimeout(r, 8000))
    const started = await queryReady()
    return NextResponse.json({
      ok: true,
      message: started.ready
        ? 'Tunnel started and connected to Cloudflare.'
        : 'Tunnel starting — refresh in a few seconds. (It becomes supervised after the next container restart.)',
      running: started.ready,
      readyConnections: started.readyConnections,
    })
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return NextResponse.json({ error: 'Failed to signal cloudflared.' }, { status: 500 })
  }

  // Give the supervisor time to respawn (it sleeps 5s after exit) and reconnect.
  await new Promise((r) => setTimeout(r, 8000))
  const ready = await queryReady()

  return NextResponse.json({
    ok: true,
    message: ready.ready
      ? 'Tunnel restarted and reconnected to Cloudflare.'
      : 'Tunnel process signalled. Reconnecting — refresh in a few seconds.',
    running: ready.ready,
    readyConnections: ready.readyConnections,
  })
}
