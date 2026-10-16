# Groundwork

Groundwork is a workplace management tool for program-based organizations: nonprofits, youth programs, tutoring centres and small teams. It is generic enough for any business. One dashboard brings together projects, their tasks, documents, and a calendar with reminders. Each organization picks a preset that sets its words, so the same app can read as a nonprofit tool ("Programs", "Sessions") or a business tool ("Projects", "Meetings").

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

| Person        | Email                         | Role    |
| ------------- | ----------------------------- | ------- |
| Jordan Ellis  | jordan@northside.example.org  | owner   |
| Priya Shah    | priya@northside.example.org   | manager |
| Marcus Chen   | marcus@northside.example.org  | admin   |
| Sofia Alvarez | sofia@northside.example.org   | staff   |

The shortcut isn't rendered, and its server action refuses to run, when `NODE_ENV` is `production` (for example under `npm run build && npm start`). It also needs `SUPABASE_SERVICE_ROLE_KEY`, so it never appears on a deployment without one.

To start over with a clean database: `npm run db:reset && npm run seed`.

## How magic links work locally

Locally, Supabase doesn't send real email. Every message goes to **Mailpit**, the mail catcher bundled with the Supabase CLI, at **http://127.0.0.1:54324**.

1. On `/login`, enter any address (for example `you@example.org`) and press **Email me a sign-in link**.
2. Open http://127.0.0.1:54324 and click the newest message.
3. Click the link. It opens `/auth/confirm`; press **Continue to Groundwork**. Only then is the one-time token used, and you're sent on: to the page you were trying to reach, to `/create-organization` if you belong to no organization yet, or to your dashboard.

The emails come from `supabase/templates/`. The deploy pipeline installs the same templates on the hosted project (on a new Free-plan Supabase project, Supabase only allows that once custom SMTP is set up). Because nothing is verified until the button is pressed, mail-security scanners that open every link can't use up the token, and the link works on any device or browser, not just the one that asked for it. Local email is rate-limited to 100 per hour (`supabase/config.toml`); after editing a template, restart with `npx supabase stop && npx supabase start`.

New users create an organization and become its owner. Owners and managers invite people in **Settings → Members**, or from a task's **Invite someone to assign** link (which opens the same form with the task's project ticked, and assigns the task to the new invitee): enter a name, email, role and the projects they'll join, then copy the invite link and send it yourself. Groundwork doesn't email invitations. The invitee opens the link and signs in with that exact email address (or just signs in: invitations for a verified address are shown straight after sign-in) and joins.

People see only the projects they're on; owners see every project. On a project, leads manage everyone, project admins manage staff, and someone's organization role caps their project role. Pending invitees can be assigned work on the projects their invitation grants. Removing someone, or leaving, hands their open work to a person you choose, and flags anything that person can't see as **Needs assignee**.

What someone makes (a project, task, calendar item or document) can't be edited or deleted by anyone ranked below the role they held when they made it. The creator, people of the same rank and higher ranks can; a task's assignee can still move it and mark it done. The database enforces this, and the app shows such items read-only with a note saying why.

A project can keep a participant roster (tick "Keeps a participant roster" in its settings). Its project admins and leads, and owners, then get **Attendance** in the sidebar: the people the program serves (with contact, guardian, emergency and care details), a phone-friendly check-in for each of its sessions (calendar items), and reports with attendance rates per person and per program, a comparison chart and CSV download. Project staff never see participant data. Archiving someone hides them but keeps their history; owners and managers can delete someone permanently for a privacy request, which erases their details and keeps their past marks anonymised so totals don't change.

Owners and managers also get **Funds**: each fund (a grant, a donation drive, a budget) has a total that's split into labelled parts, shown as a bar chart with each part's amount and share. A fund, or any part of it, can be linked to a project, whose page then shows its funding; the dashboard's **Funding** widget shows how much of each fund is allocated. The database won't let parts add up to more than the fund. Nobody else sees funds.

## Scripts

| Script                      | What it does                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`               | Next.js dev server on port 3000                                                        |
| `npm run build` / `npm start` | Production build / serve it                                                          |
| `npm run typecheck`         | `next typegen` then `tsc --noEmit` (TypeScript strict)                                 |
| `npm run lint`              | ESLint (Next core-web-vitals and TypeScript rules), zero warnings allowed              |
| `npm run check:labels`      | Fails if a primitive label (Project, Task, Session…) is hard-coded instead of using `t()` |
| `npm test`                  | Vitest unit tests: `t()`, the fixed theme and its contrast, dates, filters, validation, layout |
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

## Deploying

Deployment is automated with GitHub Actions. **CI** (`.github/workflows/ci.yml`) runs every check on each pull request. On `main`, once the checks pass, CI runs **Deploy** (`.github/workflows/deploy.yml`), which:

1. applies `supabase/migrations` to your hosted Supabase project;
2. builds the app and deploys it to Vercel production;
3. points Supabase Auth at the deployed URL (site URL, redirect allow-list), at your SMTP provider if configured, and installs the sign-in email templates;
4. smoke-tests the live site: `/` shows the landing page, the magic-link form renders, and the dev shortcut is absent.

Until the settings below exist, the Deploy job finishes without deploying and its job summary lists exactly what's missing.

### One-time setup

1. **Create a Supabase project** at [supabase.com/dashboard](https://supabase.com/dashboard). Choose a region near your users and a strong database password, and keep the password.
   - Copy the **Project ID** (Project Settings → General). This is the project ref.
   - Create an **access token** (Account → Access Tokens).
2. **Create a Vercel account** and an **access token** (Account Settings → Tokens). The workflow creates a Vercel project named `groundwork` on its first run, in your account's default team (set `VERCEL_SCOPE` to use another team). Don't also import the repo with Vercel's Git integration, or every push will deploy twice.
3. **Set up email so sign-in links reach anyone.** Supabase's built-in mailer only delivers to members of your Supabase organization, a few times an hour, and new Free-plan projects can't use Groundwork's email templates with it. Without them, sign-in still works, but each link only opens in the browser that asked for it and mail scanners can use it up. Any SMTP provider works; for example, with [Resend](https://resend.com), verify your domain and create an API key, which gives host `smtp.resend.com`, port `465`, user `resend`, password = the API key.
4. **Add the settings** in GitHub → Settings → Secrets and variables → Actions:

   | Kind     | Name                    | Value                                                                 |
   | -------- | ----------------------- | --------------------------------------------------------------------- |
   | Secret   | `SUPABASE_ACCESS_TOKEN` | Supabase access token                                                 |
   | Secret   | `SUPABASE_DB_PASSWORD`  | the project's database password                                       |
   | Secret   | `VERCEL_TOKEN`          | Vercel access token                                                   |
   | Variable | `SUPABASE_PROJECT_REF`  | the Project ID from step 1                                            |
   | Secret   | `SMTP_PASS`             | SMTP password or API key (step 3)                                     |
   | Variable | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM` | SMTP server, port and user, and the sender address as a plain email, e.g. `hello@your-domain` |
   | Variable | `VERCEL_SCOPE` *(optional)* | the Vercel team slug to deploy into; defaults to the token account's default team |
   | Variable | `VERCEL_PROJECT_NAME` *(optional)* | defaults to `groundwork`                                   |
   | Variable | `APP_URL` *(optional, later)* | leave unset for the first deploy; see *Custom domain* below   |
   | Variable | `GOOGLE_CLIENT_ID` *(optional)* | for Google sign-in; see *Google sign-in* below              |
   | Secret   | `GOOGLE_CLIENT_SECRET` *(optional)* | for Google sign-in; see *Google sign-in* below          |

5. **Run it:** merge to `main`, or open Actions → CI → Run workflow on `main`. When the Deploy job finishes, its summary shows the live URL.
6. **Open the URL, sign in with your email, and create your organization.** You're its owner; invite your team from Settings → Members.

To redeploy at any time, run CI on `main` again (Actions → CI → Run workflow). Re-running an older run never redeploys an older commit; only the latest commit on `main` is deployed.

### Maintenance mode

Maintenance mode shows everyone a "We're doing some maintenance" page (HTTP 503) while the landing page stays up. It's switched from GitHub, not the database, so it works while the database is being changed.

One-time setup:

1. In Vercel: **Storage → Create → Edge Config**, then connect it to the `groundwork` project (this adds the `EDGE_CONFIG` environment variable).
2. In GitHub (**Settings → Secrets and variables → Actions**): add the variable `EDGE_CONFIG_ID` (the Edge Config's id, `ecfg_…`).
3. For the owner bypass: add a long random `MAINTENANCE_BYPASS_TOKEN` (16+ characters) both as a Vercel environment variable (Production) and as a GitHub secret. Visiting any page with `?bypass=<token>` then lets you use the site during maintenance for that browser session.

To switch it: **Actions → Maintenance → Run workflow**, choose on or off, and optionally a message, a start time and an expected end time (e.g. `2026-10-25T22:00:00-04:00`). "Off" with a future start schedules a notice that signed-in people see from 48 hours before. To deploy behind maintenance, run **CI** by hand on main with "Deploy behind maintenance mode" ticked, or put `[maintenance]` in the commit message: it switches on before the migrations and off after the smoke test.

Without Edge Config, the `MAINTENANCE_MODE`, `MAINTENANCE_MESSAGE`, `MAINTENANCE_STARTS_AT` and `MAINTENANCE_ENDS_AT` Vercel environment variables work too, but changing them needs a redeploy.

### Google sign-in

Optional. Until both settings below exist, the sign-in page offers only the email link.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project (or pick one), then open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name (Groundwork), a support email and your domain, and add the scopes `email`, `profile` and `openid`. Publish the app when you're ready for people outside your test users.
2. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**. Choose **Web application**. Under **Authorized redirect URIs**, add `https://<your-project-ref>.supabase.co/auth/v1/callback` (the project ref from step 1 above). Leave the JavaScript origins empty.
3. Copy the **Client ID** into the GitHub variable `GOOGLE_CLIENT_ID` and the **Client secret** into the GitHub secret `GOOGLE_CLIENT_SECRET`. Never paste either into an issue, chat or commit.
4. Redeploy. The deploy turns Google on in Supabase Auth and builds the app with the **Continue with Google** button. If only one of the two is set, the deploy stops and says which is missing.

Supabase links a Google sign-in to an existing account only when Google says the address is verified, and Groundwork only matches invitations to verified addresses.

### Custom domain

After the first deploy has created the Vercel project:

1. Add the domain under Vercel → `groundwork` → Settings → Domains and point its DNS at Vercel. For an apex domain, also add `www.` and set it to redirect (308) to the apex. A CAA record `0 issue "letsencrypt.org"` limits certificates to the authority Vercel uses.
2. Once Vercel shows the domain as valid, set the `APP_URL` variable to it (`https://your-domain` or just `your-domain`) and run CI on `main` again. Use the domain that serves the site, not one set to redirect: the deploy refuses a redirecting domain. Sign-in emails and invite links then always use that domain, and the `*.vercel.app` address forwards to it (308).

Without `APP_URL`, every production domain of the project can receive sign-in links, but only domains that existed at the last deploy are on Supabase's redirect allow-list. After adding a domain, run the deploy again; until then, sign-in links requested from it open on the main production URL instead.

### Doing it by hand instead

Everything the workflow does can be done manually:

- `SUPABASE_ACCESS_TOKEN=<token> SUPABASE_DB_PASSWORD=<db-password> npx supabase db push --project-ref <ref>`. Pass the password through the environment, not `--password`, in case it starts with `-`.
- Configure Supabase Auth with the same script the workflow uses: `SUPABASE_ACCESS_TOKEN=<token> SUPABASE_PROJECT_REF=<ref> npx tsx scripts/deploy/configure-auth.ts https://your-domain` (add the `SMTP_*` variables to set up email too). It sets the Site URL and Redirect URLs and installs both email templates. To do it in the dashboard instead: in Authentication → URL Configuration, set **Site URL** to `https://your-domain` and add `https://your-domain/**` to **Redirect URLs**; set up custom SMTP under Authentication → Emails; then paste `supabase/templates/magic_link.html` into the **Magic Link** template and `supabase/templates/confirmation.html` into **Confirm signup**, with the subjects from `supabase/config.toml`. New users get the Confirm signup email, so both are needed.
- Import the repo in Vercel and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase → Project Settings → API Keys), plus optionally `NEXT_PUBLIC_SITE_URL`. The deployed app doesn't need `SUPABASE_SERVICE_ROLE_KEY`. Don't run the seed against production.

Uploads go straight from the browser to Supabase Storage through a signed upload URL, so Vercel's request-body limit never applies to the 25 MB maximum.

## Project layout

```
app/                       routes (App Router)
  login, auth/confirm, auth/callback, auth/signout, create-organization, invite/[token]
  [orgSlug]/               dashboard, projects, tasks, calendar, documents, settings
    */actions.ts           server actions (zod-validated)
components/                UI, by feature; components/ui holds the primitives
lib/
  supabase/                server, browser and service-role clients, generated types
  terminology/             t(), defaults, client provider
  theme/                   colour maths, the fixed two-scale theme, contrast checks
  dates.ts, validation.ts, queries.ts, org.ts, dashboard-layout.ts …
proxy.ts                   session refresh and redirect to /login (Next 16's "middleware")
supabase/migrations/       one migration per concern, RLS alongside each table
supabase/tests/            pgTAP suite (fixtures.inc is shared by every file)
scripts/                   seed, check-labels, write-env; deploy/ holds the deploy pipeline's helpers
tests/unit, tests/e2e      Vitest and Playwright
docs/BRIEF.md              the original brief
docs/decisions.md          every judgement call, with reasons
```

## Design system in one paragraph

There are two colour scales, navy (`#163260`) and bone (`#FBF9F4`, `#F5F1E8`, `#DDD6C8`). Every other colour is a tint or shade derived from those two. Tailwind's default palette and shadows are removed, so nothing else can creep in. The sidebar rail is a solid navy-over-bone tint (`#4D6284`). Status is always shown by label and icon, never by colour alone. The theme is fixed: every token is derived from the navy in `lib/theme/theme.ts`, written into `app/globals.css`, and a unit test checks that the two match and that every text pair stays at 4.5:1 or more. Animation is CSS only and switches off under `prefers-reduced-motion`.
