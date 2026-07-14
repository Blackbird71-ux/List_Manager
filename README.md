# Lists Manager

Reusable checklist templates for the team. Build a template once (items, priorities,
custom fields, recurrence), then create working copies from it — ticking off a copy
never touches the master. When every item on a recurring checklist is ticked, the
next instance is created automatically (Notion-style spawn-on-completion) with its
due date advanced by the recurrence interval.

## Features

- **Templates** — master task lists with items, per-item priorities, custom fields
  (text / dropdown / user), category and recurrence. Archive or delete without
  breaking existing checklists.
- **Checklists** — created from a template or ad hoc. Due dates, priorities,
  assignees (whole list and per item), notes, file attachments (10 MB cap),
  progress tracking, and a record of who ticked each item and when.
- **Recurrence** — none / daily / weekly / fortnightly / monthly / quarterly /
  yearly. Completing the last item spawns the next instance, anchored to the due
  date (a monthly list due on the 1st stays on the 1st).
- **Re-use without recurrence** — completed one-off checklists offer a "Run it
  again" prompt (pick the next due date, optionally make it repeat); a Reset
  button unchecks everything in place; templates have a one-click
  "Start checklist" action.
- **Users & notifications** — per-user logins (NextAuth credentials), admin role
  for user management, in-app notifications when a checklist is assigned to you
  or a recurring list respawns.

## Stack

Next.js 16 (App Router, standalone output) · TypeScript · Prisma 7 + SQLite
(better-sqlite3 driver adapter) · NextAuth v5 · Tailwind 4 · Luxon
(Australia/Sydney) · Vitest.

## Local development

```bash
npm install
cp env.local.example .env.local   # fill in AUTH_SECRET
npx prisma migrate dev
npm run dev                        # http://localhost:3400
```

The first visit shows a **Create admin account** form (registration is open only
while the database has zero users). After that, the admin adds accounts from the
Users page.

Checks: `npm run lint` (tsc), `npm run test` (vitest), `npm run build`.

## Deploying to the Synology NAS

Persistent data (SQLite DB, attachments, backups) lives in
`/volume1/docker/listsmanager/Data`, mounted as `/data`. Cloudflare tunnel
credentials go in `/volume1/docker/listsmanager/cloudflared` (config.yml +
credentials JSON) — the tunnel starts automatically if config.yml exists.

```bash
# On the NAS, in the repo directory:
#   .env.local needs AUTH_SECRET (openssl rand -base64 32)
docker compose up -d --build
docker compose logs -f            # watch migrations + startup
```

- App listens on host port **3002**; public URL is set by `AUTH_URL` in
  docker-compose.yml (https://lists.liddleapps.com).
- Migrations run automatically at container startup (`prisma migrate deploy`),
  with a pre-deploy DB backup kept in `/data/backups` (last 10).
- A cron job inside the container backs up the DB daily at 03:00 (last 14 kept).
- Health check: `GET /api/health`.
