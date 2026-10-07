# Groundwork

Groundwork is a workplace management tool for program-based organizations: nonprofits, youth programs, tutoring centres and small teams. It is generic enough for any business. One dashboard brings together projects, their tasks, documents, and a calendar with reminders. Terminology is configurable, so the same app can read as a nonprofit tool ("Programs", "Sessions") or a business tool ("Projects", "Meetings").

Built with Next.js 16 (App Router, TypeScript strict), Tailwind CSS 4 and Supabase (Postgres, magic-link auth, storage, row-level security).

## Quick start (fresh clone)

You need **Node.js 20.9 or newer** (22 recommended) and **Docker** running. The Supabase CLI is installed as a dev dependency, so there's nothing else to install globally.

```bash
npm install
npx supabase start      # first run pulls the Docker images; applies all migrations
npm run env:local       # writes .env.local from `supabase status`
npm run seed            # demo org "Northside Youth Collective"
npm run dev             # http://localhost:3000
```

Open http://localhost:3000/login. In development, the login page has a **Development shortcut**: one-click sign-in as any seeded demo user, no email needed:

| Person        | Email                         | Role   |
| ------------- | ----------------------------- | ------ |
| Jordan Ellis  | jordan@northside.example.org  | admin  |
| Priya Shah    | priya@northside.example.org   | member |
| Marcus Chen   | marcus@northside.example.org  | member |
| Sofia Alvarez | sofia@northside.example.org   | member |

The shortcut isn't rendered, and its server action refuses to run, when `NODE_ENV` is `production` (for example under `npm run build && npm start`). It also needs `SUPABASE_SERVICE_ROLE_KEY`, so it never appears on a deployment without one.

To start over with a clean database: `npm run db:reset && npm run seed`.

## How magic links work locally

Locally, Supabase doesn't send real email. Every message goes to **Mailpit**, the mail catcher bundled with the Supabase CLI, at **http://127.0.0.1:54324**.

1. On `/login`, enter any address (for example `you@example.org`) and press **Email me a sign-in link**.
2. Open http://127.0.0.1:54324 and click the newest message.
3. Click the link. It goes through Supabase Auth to `/auth/callback`, which exchanges the code for a session cookie and sends you on: to the page you were trying to reach, to `/create-organization` if you belong to no organization yet, or to your dashboard.

Links use the PKCE flow, so open them in the same browser you requested them from. Local email is rate-limited to 100 per hour (`supabase/config.toml`).

New users create an organization and become its admin. Admins invite people in **Settings → Members**: enter an email and role, then copy the invite link and send it yourself. Groundwork doesn't email invitations. The invitee opens the link, signs in with that exact email address, and joins.

## Scripts

| Script                      | What it does                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`               | Next.js dev server on port 3000                                                        |
| `npm run build` / `npm start` | Production build / serve it                                                          |
| `npm run typecheck`         | `next typegen` then `tsc --noEmit` (TypeScript strict)                                 |
| `npm run lint`              | ESLint (Next core-web-vitals and TypeScript rules), zero warnings allowed              |
| `npm run check:labels`      | Fails if a primitive label (Project, Task, Session…) is hard-coded instead of using `t()` |
| `npm test`                  | Vitest unit tests: `t()`, contrast and theme logic, dates, filters, validation, layout |
| `npm run test:db`           | pgTAP tests (`supabase test db`): RLS, tenant isolation, roles, storage, invitations   |
| `npm run test:e2e`          | Playwright smoke tests (starts the dev server if needed; needs Supabase running and `npm run seed`) |
| `npm run seed`              | Idempotent demo data; rebuilds only the demo organization on each run                  |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local stack; `db:reset` re-applies every migration            |
| `npm run db:types`          | Regenerates `lib/supabase/database.types.ts` from the local schema                     |
| `npm run env:local`         | Writes `.env.local` from the running local stack (add `-- --force` to overwrite)       |
| `npm run verify`            | typecheck, lint, check:labels, unit tests and build in one go                          |

### Running the whole test suite

```bash
npx supabase start && npm run seed
npm run test:db && npm run typecheck && npm run lint && npm run check:labels && npm test && npm run build
npm run test:e2e
```

The smoke test signs in through a real magic link, which it reads from Mailpit's API. It creates a project and a task, then moves the task by keyboard drag and by button. It adds and edits an event, and uploads, downloads and searches for a document. It switches the preset and overrides a label. It reorders, resizes and hides dashboard widgets, reloads, and checks the layout persisted. It also exercises the invitation flow, the dev shortcut, and reduced motion.

If Playwright's own Chromium build isn't installed, point it at any Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:e2e`. Set `E2E_BASE_URL` to test an already-running deployment instead of starting a dev server, and `MAILPIT_URL` if Mailpit isn't on port 54324.

## Environment variables

| Variable                               | Where           | Purpose                                                                          |
| -------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | browser + server | Supabase API URL                                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable (anon) key. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted        |
| `SUPABASE_SERVICE_ROLE_KEY`            | server only      | Used only by `npm run seed` and the dev-only sign-in shortcut. Never prefix it with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL`                 | server           | Public origin for magic-link redirects and invite links. Optional locally; set it in production |

See `.env.example`. `npm run env:local` fills these in for the local stack.

## Deploying to Vercel

1. **Create a Supabase project** at supabase.com. Then link it and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push        # applies supabase/migrations, including the storage bucket and its policies
   ```
2. **Configure auth** in the Supabase dashboard (Authentication → URL Configuration):
   - Set **Site URL** to `https://your-domain`.
   - Add `https://your-domain/**` to **Redirect URLs**. Add `https://*-your-team.vercel.app/**` too if you want preview deployments to sign in.
   - Under Authentication → Emails, configure **custom SMTP**. Supabase's built-in mailer is heavily rate-limited and isn't meant for production.
3. **Create the Vercel project** from this repository (framework preset: Next.js; build command `next build`). Then add the environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, from Supabase → Project Settings → API.
   - `NEXT_PUBLIC_SITE_URL=https://your-domain`.
   - Leave out `SUPABASE_SERVICE_ROLE_KEY` unless you plan to run the seed from a trusted machine. The deployed app doesn't need it.
4. **Deploy.** Optionally seed a staging project from your machine with `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed`. Don't seed production.

Uploads go straight from the browser to Supabase Storage through a signed upload URL, so Vercel's request-body limit never applies to the 25 MB maximum.

## Project layout

```
app/                       routes (App Router)
  login, auth/callback, auth/signout, create-organization, invite/[token]
  [orgSlug]/               dashboard, projects, tasks, calendar, documents, settings
    */actions.ts           server actions (zod-validated)
components/                UI, by feature; components/ui holds the primitives
lib/
  supabase/                server, browser and service-role clients, generated types
  terminology/             t(), defaults, client provider
  theme/                   colour maths, two-scale theme derivation, contrast gate
  dates.ts, validation.ts, queries.ts, org.ts, dashboard-layout.ts …
proxy.ts                   session refresh and redirect to /login (Next 16's "middleware")
supabase/migrations/       one migration per concern, RLS alongside each table
supabase/tests/            pgTAP suite (fixtures.inc is shared by every file)
scripts/                   seed, check-labels, write-env
tests/unit, tests/e2e      Vitest and Playwright
docs/BRIEF.md              the original brief
docs/decisions.md          every judgement call, with reasons
```

## Design system in one paragraph

There are two colour scales, navy (`#1F2D4D`) and bone (`#FBF9F4`, `#F5F1E8`, `#DDD6C8`). Every other colour is a tint or shade derived from those two. Tailwind's default palette and shadows are removed, so nothing else can creep in. The sidebar rail is a solid navy-over-bone tint (`#555E74`). Status is always shown by label and icon, never by colour alone. An admin can change the navy base and switch light or dark mode; the app derives the rest and rejects any change that drops text contrast below 4.5:1. Animation is CSS only and switches off under `prefers-reduced-motion`.
