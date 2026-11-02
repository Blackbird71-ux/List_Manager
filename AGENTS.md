# ListsManager — agent rules

Multi-organisation checklist app: templates, recurring checklists, departments, sign-off, comments/activity, attachments, digests and escalation, push/email notifications, Drive backup, reports. **Next.js 16.2.4**, NextAuth v5 (Credentials), Prisma 7 + SQLite (`better-sqlite3` adapter), Luxon, zod, vitest. Tenancy key: `organizationId`. Roles: `admin` | `manager` | `member`, plus department membership.

**Commands:** `npm run dev` (port 3400) · `npm run lint` (= `tsc --noEmit`, before/after every change) · `npm test` (vitest run; tests in `src/lib/__tests__`).

General discipline (assumptions, simplicity, surgical changes, plan first) comes from your global instructions (Claude: `~/.claude/CLAUDE.md`). Plans and reviews: `plans/`. Setup: `README.md`.

---

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

# API route security — every route guards itself

There is no `middleware.ts`; a route without its own check is public.

1. Start every handler with `auth()` from `@/lib/auth` → `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`.
2. **Access goes through `src/lib/access.ts`** — never hand-roll role checks: `checklistAccessWhere(userId, role, organizationId)` (throws if `organizationId` is missing — that's deliberate), `canAccessChecklist`, `canManageChecklist`, `canEditTemplate`, `canSeeAllChecklists`, `isPrimaryOrgAdmin`.
3. Settings routes use `requirePrimaryAdmin` (`src/app/api/settings/drive-backup/guard`). The Drive OAuth callback is guarded too and checks its state cookie.
4. Every query is scoped to `organizationId` — `findFirst({ where: { id, organizationId } })`, never bare `findUnique({ where: { id } })`.
5. Scheduler routes (`api/scheduler/*`) accept the `x-digest-secret` header (`DIGEST_SECRET`, constant-time compare) **or** a session — keep both paths.
6. **Known public routes** (anything else new needs user sign-off): `auth/[...nextauth]`, `health` (status only — no paths, versions, raw errors), `register`, `password-reset/request`, `password-reset/confirm`, `calendar/feed/[token]` (per-user secret token, hashed in `User.calendarTokenHash`; scoped by `checklistAccessWhere`; rate-limited).
7. After touching routes, sweep — every hit must be on the public list:
   ```
   rg --files-without-match "auth\(\)|requirePrimaryAdmin" -g "route.ts" src/app/api
   ```

# Domain rules

- **Sign-off is four-eyes:** only a manager or admin signs off, never the person who completed the list — `checkSignOff` in `src/lib/sign-off.ts`. Don't bypass it.
- **Shared helpers over inline logic.** Domain logic lives in `src/lib/` (`access`, `checklist-helpers`, `recurrence`, `conditions`, `sign-off`, `escalation`, `digest`/`my-digest`, `notifications`, `activity`, `template-history`, `import-parser`, `drive-backup`, `rate-limit`, …). Routes do auth → parse (zod) → call helper → respond. Grep for a helper before writing logic; two copies is one too many.

# Timezone — via `src/lib/timezone.ts`

Server is UTC; users are `APP_TIMEZONE` (default Australia/Sydney). Only `timezone.ts` imports Luxon (tests may use it to pin `Settings.now`). Helpers: `todayStart()` / `startOfDayInTz(date?)` for day boundaries, `plusInTz(date, step)` for calendar steps, `weekBoundsInTz(weeksAgo)` for week buckets, `formatInTz(date, options)` / `formatInTzPattern(date, pattern)` for display. Missing one? Add it there — never import Luxon in a route or lib file. Never use UTC midnight as "today"; test new date logic across the Australian DST transitions (Oct, Apr).

# Forms, dialogs, editors — no silent field loss

1. **Before editing, list every `<input>`, `<select>`, `<textarea>` and checkbox** (including conditional ones); **after, verify every one is still present.**
2. **Never remove a field without explicit instruction** — move it, don't drop it.
3. **New form mirroring a model:** cross-check `prisma/schema.prisma`; the TS interface matches the GET response; `openEdit`/`openNew` sets every field; PATCH/PUT sends every editable field and the handler (zod schema included) accepts it.

# SSR safety

Never touch `localStorage`, `sessionStorage`, `window` or `document` in a `useState` initialiser or at module load — read them in `useEffect`.

---

# Database and deploy

- **Schema changes need a migration:** `prisma/migrations/<timestamp>_<name>/migration.sql` (timestamp-named, `prisma migrate dev` style). Production runs only `migrate deploy` — never `db push` there.
- **Deploy:** `deploy-build.bat` builds the image and exports `listsmanager.tar` for the NAS (`deploy-nas.sh`). Don't run the production image on Windows. `docker/entrypoint.sh` takes a pre-migration backup (keeps 10), runs `prisma migrate deploy`, then starts cron for scheduled backups. Prod DB: `file:/data/listsmanager.db`.

---

# Code navigation

Codebase Memory MCP (if connected): prefer graph tools (`search_graph`, `trace_call_path`, `detect_changes`) for structure and blast radius; Grep/Read for exact text and line edits. If it's unavailable, say so once and continue with Grep/Read.

# Done and commits

- `npm run lint` clean; `npm test` passes for touched modules.
- **Walk it from the user's chair** before coding and before reporting done: every site the thing appears or is chosen (add form, edit dialog, bulk/paste, settings, filters, empty and done/archived views — an option added in one must appear in all); the default state a new user/org/list sees (a control hidden until "set up" is a dead end); full lifecycle (create → see → use → change → reorder → rename → remove → undo, and whether removal orphans data); natural gestures (drag, multi-select, paste many, tap on a phone); offline and mobile. Check each role (admin / manager / member, in and out of the department) sees what they should. State the walk-through and any knowingly-left gap, with a recommendation. One complete pass, not several slices — standing feedback: *"you seem to be doing the bare minimum and not thinking like a user."*
- Commit only when asked; branch off `main` first; multi-line messages via `git commit -F <file>`.
