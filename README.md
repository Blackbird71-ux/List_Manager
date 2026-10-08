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
- **Subtasks & sections** — items can have indented subtasks; imported lists keep
  their section headings, which collapse and show per-section progress.
- **Pass / Fail / N/A** — each item can carry a result, shown as a badge on the row.
- **Conditional items** — an item can be shown only when an earlier item has a
  chosen result (e.g. Fail); hidden items don't count towards completion.
- **Relative due dates** — items can be due N days before the list's due date; set
  on templates so every run gets the right dates.
- **Mark all remaining** — tick everything left as Done, Pass or N/A in one click.
- **Dashboard filters & Calendar** — clickable stat tiles, a due-today / next-7-days
  filter, saved filter views (per account) and a month Calendar of due lists
  and items.
- **Printable record** — a clean print view of a list with results, who/when and
  sign-off, for PDF or paper.
- **Photo capture** — on a phone, take a photo straight into an item.
- **Escalation** — admins and managers are notified when a list has been overdue
  for a set number of days (Settings, primary admin).
- **Template history** — every edit to a template's items or fields is saved as a
  version; view or restore any earlier one (restoring saves it as a new version).
- **Personal digest** — at 07:30 each person with email reminders on gets one email
  listing their assigned lists and items that are overdue or due in the next 7 days
  (nothing is sent on a clear day).
- **Reports** — per person and per template: average completion time and the
  percentage of lists finished after their due date.
- **Webhook** — a signed JSON event is posted to an https address when a list is
  completed or signed off (Settings, primary admin).
- **Reminders** — set a due date plus a reminder offset (1 hour to 3 days before)
  and the assignee is notified.
- **Supporting documents** — files attached to the whole checklist, separate from
  per-item attachments (10 MB each, stored on disk under `/data`).
- **Manager sign-off** — tick "needs sign-off" on a list and, once finished, a
  manager or admin must approve it or send it back with a reason. The person who
  completed the list cannot approve it (four-eyes rule). Approver and note are
  recorded in the activity log.
- **Import & export** — create templates from `.docx`, `.xlsx`, `.csv`, `.md`,
  `.txt` or JSON files (reviewed before saving); export all templates as JSON; save
  any checklist as a template.
- **Comments & activity** — discussion with @mentions, plus a full audit
  trail of who did what and when.
- **Visibility** — team, department or private; managers and admins see everything.
  My Work shows what is assigned to you, My Team what your department is doing,
  Completed is the permanent record (CSV export), Reports is for managers.
- **Users & notifications** — per-user logins (NextAuth credentials), roles
  (member / manager / admin), departments, in-app, push and email notifications.
- **Context-aware help** — the **?** button in the header opens help for the page
  you are on, adapts to your role, and on a checklist leads with what applies to it
  right now (awaiting sign-off, completed, recurring, overdue).
- **Google Drive backup** — nightly copy of the database and uploaded files to
  the admin's Google Drive, set up under Settings (see below).
- **Search** — Ctrl+K / ⌘K searches checklists and items from anywhere.

## Checklist page layout

On screens 1280px wide or more the list sits on the left, starting at the top, and
everything else (title and actions, selected item, due date / assignee / custom
fields, sharing, documents, comments) lives in a side column on the right. Drag the
bar between them to resize it (double-click to reset); the width is remembered per
device. Clicking an item opens its notes, result, assignee and attachments in the
side column. On narrower screens it is a single column and item details expand
under the item. All per-item controls (notes, subtask, delete, tick box, drag grip)
are at the right-hand end of the row.

## Maintaining the in-app help

Help text lives in `src/components/HelpMenu.tsx` (`baseTopicsFor` for each page,
`checklistNowTopics` for state-specific tips). Pages report their state with
`useHelpTags([...])`. When you add or change a feature, update the matching topic.

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

Registration is open: the first visit creates your organisation (you become its
admin — the first organisation on an install is the *primary* one, whose admins
manage instance-wide settings like email and the tunnel). Everyone else either
joins with the invite code shown to admins under Settings → Organisation, or
founds their own organisation — a primary-org admin can switch off new
organisations under Settings → Registration. Admins can also add accounts
directly from the Users page.

Checks: `npm run lint` (tsc), `npm run test` (vitest), `npm run build`. Run
`npx prisma generate` before `tsc` after any schema change (`npm install` does it
automatically).

### Changing the database

Migrations are hand-written SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`
(newer than the last folder). After editing `prisma/schema.prisma`:

```bash
npx prisma generate
DATABASE_URL=file:./prisma/dev.db npx prisma migrate deploy   # apply locally
```

Never use `db push` or `migrate dev` against the NAS; the container applies
migrations itself at startup.

## Deploying to the Synology NAS

Persistent data (SQLite DB, attachments, backups) lives in
`/volume1/docker/listsmanager/Data`, mounted as `/data`. Cloudflare tunnel
credentials go in `/volume1/docker/listsmanager/cloudflared` (config.yml +
credentials JSON) — the tunnel starts automatically if config.yml exists.

**Normal release (from the Windows dev machine):**

1. Run `npm run lint`, `npm run test` and commit.
2. Run `deploy-build.bat`. It builds the Docker image, saves it to
   `listsmanager.tar`, and copies the tar, `deploy-nas.sh` and **`.env.local`** to
   the NAS over scp.
3. On the NAS: `sudo sh /volume1/docker/listsmanager/deploy-nas.sh`. It replaces
   the container, applies pending migrations and prints the startup logs.

Migrations and backups are automatic — there is nothing to run by hand. On every
start the container backs up the DB and then applies pending migrations. Afterwards,
check `docker logs listsmanager-app` for the migration and startup lines.

`deploy-build.bat` copies your local `.env.local` to the NAS, replacing the one
there. Keep the two identical, and don't quote values (Docker's `--env-file` keeps
the quotes).

**First-time / manual setup** (from the repo directory on the NAS):

```bash
#   .env.local needs AUTH_SECRET (openssl rand -base64 32)
docker compose up -d --build
docker compose logs -f            # watch migrations + startup
```

- App listens on host port **3002**; the public URL used in password-reset
  emails is set by `APP_URL` in docker-compose.yml / deploy-nas.sh
  (https://lists.liddleapps.com). Do not set `AUTH_URL` — auth trusts the
  request host, and an https `AUTH_URL` breaks login over plain-http LAN.
- Migrations run automatically at container startup (`prisma migrate deploy`),
  with a pre-deploy DB backup kept in `/data/backups` (last 10).
- A cron job inside the container backs up the DB daily at 03:00 (last 14 kept,
  local to the NAS), copies it to Google Drive at 03:30 (see below) and sends the
  overdue digest at 07:00, the personal digest at 07:30 and escalation of long-overdue lists at 08:00.
  Running again a list or recurring copy duplicates its supporting documents as
  separate files; deleting a list or item removes its files from disk.
- Uploaded files (item attachments and supporting documents) are stored under
  `/data/attachments`. The local DB backups don't include them, but the Google
  Drive backup does.

### Google Drive backup

Nightly at 03:30 the app uploads a gzipped DB snapshot (newest 30 kept) and any
attachments not yet on Drive to a "Lists Manager Backups" folder (`database/` and
`attachments/`). Files deleted in the app are not deleted from Drive. Nothing goes in
`.env.local`; credentials are stored in the app database.

One-time setup, by a primary-organisation admin:

1. In Google Cloud Console create an OAuth client ID (type *Web application*) and
   enable the Google Drive API. Add the authorised redirect URI
   `https://lists.liddleapps.com/api/settings/drive-backup/callback`.
2. Open the app via the **https** address, go to Settings → Google Drive backup,
   enter the client ID and secret and save.
3. Click **Connect Google Drive** and approve. Use **Back up now** to test.

The app uses the `drive.file` scope, so it only sees folders it created itself.
Reconnecting creates a fresh "Lists Manager Backups" folder rather than reusing the
old one. Status of the last run is shown in Settings and logged to
`/data/backups/drive-backup.log`.
- Health check: `GET /api/health`.
