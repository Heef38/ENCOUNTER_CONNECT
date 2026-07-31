# Environments — dev / staging / prod

**Decision (2026-07-31):** no extra hosted Supabase projects for now.

| Tier    | Backend                                   | Cost | Purpose                          |
|---------|-------------------------------------------|------|----------------------------------|
| dev     | **Local Supabase** (CLI + Docker)         | $0   | day-to-day development           |
| staging | test-church harness in prod (Option A); optionally a free-tier hosted project later | $0 | E2E walkthroughs on a real URL |
| prod    | existing hosted project                   | as today | real churches                |

Add a dedicated hosted staging project (~$10/mo) when a second real church
onboards — that's when rehearsing migrations against a prod-shaped copy stops
being optional.

---

## Local dev setup (one-time)

The Supabase CLI runs the entire stack — Postgres, Auth, Storage, Studio, a
local mail catcher — in Docker. Database rebuilds are free and instant, and
nothing you do locally can touch the hosted project.

1. **Enable Docker in WSL.** Docker Desktop is installed on Windows but its
   WSL integration is off for this distro: Docker Desktop → Settings →
   Resources → WSL integration → toggle on this distro → Apply & Restart.
   Verify inside WSL with `docker info` (should print server info, not an
   error). Docker Desktop must be running whenever you use the local stack.
2. **CLI** is a dev dependency (`npx supabase --version` to check). Repo has
   `supabase/config.toml` from `npx supabase init`.
3. **Start the stack:**
   ```bash
   npx supabase start
   ```
   First run downloads the container images (a few GB — one-time). It prints
   the local URL and keys; re-print any time with `npx supabase status`.
4. **Point the app at it** — put the values from `supabase status` in
   `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from status>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key from status>
   CRON_SECRET=dev-secret
   ```
   Keep the prod values out of `.env.local` entirely — that's the point.
5. **Build the schema:**
   ```bash
   npx supabase db reset
   ```
   Drops and recreates the local database from `supabase/migrations/` in
   order (001 → 025 → anything newer). Run it again any time you want a
   clean slate.
6. **Bootstrap data.** Two options:
   - Local Studio (http://127.0.0.1:54323) → Authentication → create a user,
     then in the Table Editor set that user's `profiles` row
     (`is_platform_admin = true`). Then use `/platform/test-data` in the app
     to seed the full test church.
   - `supabase/seed/first_church.sql` (edit the variables at the top) does the
     church + admin-link bootstrap in SQL.
7. **Auth emails** (magic links, confirmations) never leave your machine —
   they land in the local mail catcher at **http://127.0.0.1:54324**. Open it,
   click the link, you're signed in.

### Daily rhythm

```bash
npx supabase start     # once per session (Docker Desktop running)
npm run dev            # Next.js against the local stack
npx supabase stop      # when done (state is preserved)
npx supabase db reset  # whenever you want a pristine database
```

### New migrations

- Create with `npx supabase migration new <name>` — this generates a
  timestamp-prefixed file, which sorts after the existing `001`–`025`
  numeric prefixes. Both styles coexist fine; don't renumber old files.
- Test locally with `npx supabase db reset` (proves the file runs clean from
  scratch), **then** apply to prod via the dashboard SQL editor, same as
  today. Finish prod applies with `NOTIFY pgrst, 'reload schema';`
- Keep the existing rule: no dashboard-only schema changes — every change is
  a file in `supabase/migrations/` first.
- (Optional, later: `supabase link` + `supabase db push` can apply migrations
  to prod from the CLI, but adopting it on a database that predates CLI
  tracking requires a one-time `supabase migration repair` backfill. The SQL
  editor practice is fine until that bookkeeping is worth it.)

---

## Staging

**Current answer: the test-church harness (Option A).** `/platform/test-data`
seeds an isolated `test-church` tenant (users on `@test.local`) in prod, and
multi-tenant RLS fences it off from real churches. Use any Vercel preview
deployment (they point at prod Supabase) to walk flows end-to-end.
Twilio/SMS safety: test participants never have SMS consent unless you set it,
and consent is enforced at enqueue.

**When you want real isolation** (free): create one project in a separate
free-plan Supabase org (free plan includes 2 projects; they pause after ~a
week idle — wake via dashboard). Set it up like any hosted tier:

1. SQL editor → run `supabase/migrations/` in order. Gotcha: migration 014's
   `ALTER TYPE ... ADD VALUE 'video'` may need to run as its own query first.
   Finish with `NOTIFY pgrst, 'reload schema';`
2. Auth → Sign In/Up: enable Email; match prod's "confirm email" setting.
3. Auth → URL Configuration: Site URL = the environment's base URL; add
   `<base-url>/auth/confirm` to Redirect URLs.
4. Auth → Email templates → Magic Link: link target
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
5. Scope its URL + anon + service-role keys to **Preview** in Vercel
   (Settings → Environment Variables), plus its own `CRON_SECRET`.

Storage buckets come from migration 025 — no dashboard step.

---

## Prod (unchanged, for reference)

- Dashboard steps that pair with the 2026-07-31 launch code: apply migration
  **025**; magic-link email template + `/auth/confirm` redirect URL (step 4
  above with `https://encounter-connect.app`); optionally Resend SMTP under
  Auth → SMTP so auth emails come from your domain.
- Env vars live in Vercel scoped to **Production**: Supabase URL/keys,
  `CRON_SECRET`, Resend, Twilio, and (optional) Sentry
  (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and for source maps
  `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`).
