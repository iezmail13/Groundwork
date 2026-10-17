# Groundwork: standing rules

These rules come from the original build brief (docs/BRIEF.md). They apply to every change. Record any decision the rules leave open in docs/decisions.md.

Next.js 16 differs from older versions; read AGENTS.md and the bundled docs in `node_modules/next/dist/docs/` before changing framework code.

## Scope

- Groundwork is a workplace management platform for program-based organizations. The product is one dashboard plus projects, tasks, documents and a calendar with reminders.
- Also in scope: participant rosters with their files and attendance (only on projects whose type turns them on), invitations by email, and a read-only per-user ICS calendar feed.
- Also in scope (owner's decision, D82, extended by D91): funds and budget and grant tracking, meaning an amount of money split into labelled allocations that can be linked to projects, with charts, plus spending entries with receipts and approval. Budgets, totals and charts are visible to owners and managers only. This is tracking, not accounting: no bank feeds, tax, payroll, invoices, double-entry or accounting-software sync.
- Also in scope (owner's decisions, D87–D95): a site-wide maintenance switch and scheduled-maintenance notices; in-app notifications (no email, SMS or push); personal and org-level tasks outside projects, with multiple assignees, kinds, priority, hiding and sharing; member profiles, online status and an internal chat hub (text only), with discussion boards, comments on work and notifications when work changes (D106); Kanban workflows with each program's own steps (D107); read-only dashboards, including one per project; templated reports (PDF and CSV); and public marketing pages (Pricing, Security, About, Privacy, Terms, Use cases, Compare, Resources), a "Start free" path and a read-only public demo.
- Do not build onboarding, employee directories beyond member profiles, certifications, accounting, payments, payroll, donor management, billing or plans, email or SMS communications, marketing email capture, automations, video calls or meeting links, transcripts, AI-written summaries, chat attachments, per-person permission grants, or other integrations. Do not add sidebar items, routes or tables for them.
- Nothing shipped may be a placeholder, a TODO, or lorem ipsum.

## Stack

- Next.js App Router, TypeScript strict, Tailwind CSS, and Supabase (Postgres, auth, storage, RLS) run locally with the Supabase CLI and deployed on Vercel.
- Auth is Supabase Auth with Google sign-in plus the email magic link. Only trust verified emails, for example when matching invitations.
- Pre-approved packages: @supabase/supabase-js, @supabase/ssr, zod, @dnd-kit/core, @dnd-kit/sortable, lucide-react, vitest, @playwright/test, tsx. Add nothing else without a written reason in docs/decisions.md, written before the package is added; prefer none (Google sign-in and the ICS feed need no package). Charts are hand-built SVG or HTML. Live updates and chat use Supabase Realtime, which `@supabase/supabase-js` already includes.
- Fonts come from next/font: Archivo for headings and chrome, Source Sans 3 for body text and tables.
- Animation is CSS only. No animation library. Every animation stops under `prefers-reduced-motion`.
- Use server components by default. Use client components only where interaction needs them.

## Data and security (non-negotiable)

- Migrations live in `supabase/migrations`, one per concern, with RLS in the same migration as its table.
- Every org-scoped table has `organization_id`. The only global tables are `presets` (read-only to authenticated users) and `profiles` (one row per auth user).
- Every table has select, insert, update and delete policies. Policies use the security-definer helpers `is_member(org)` and `has_permission(org, role)` so they never recurse. `has_permission` compares ranks read live from the membership row, so a promotion or demotion takes effect on the next query.
- Org roles are ranked: owner (4) > manager (3) > admin (2) > staff (1). Owners and managers handle settings and members and can manage anything they can see. Nobody can grant a role above their own or change someone ranked at or above them, except owners. Project roles are lead > admin > staff, and the org role is their ceiling.
- Visibility follows project membership. Someone not on a project can't see it, its tasks, roster, files, calendar items or activity; owners see every project. Task visibility has one source of truth, `can_view_task()`, and every list, count, feed, search, notification, dashboard, profile, report, chat link and calendar feed goes through it. A task may sit outside a project (personal or org-level); `can_view_task()` applies the task-model rules (D89), not just "can see its project".
- Chat visibility has one source of truth, `can_view_channel()`. Direct messages are visible only to their two participants: they are the one place an owner can't see what isn't theirs (D90).
- The maintenance switch lives outside the database (Vercel Edge Config, with environment variables as the fallback), so the maintenance page works while the database is being migrated or is down. It adds no global table (D87).
- What someone creates (projects, tasks, events, documents) stores `created_by_role`; nobody ranked below that role can edit or delete it except its creator, and a task's assignee may still change its status. `guard_creator_rank` enforces it in the database.
- Org creation, invite acceptance and ownership transfer go through the SECURITY DEFINER functions `create_organization`, `accept_invitation` and `transfer_ownership`. The last owner can never be removed, demoted or leave.
- Never expose the service-role key to the client. It is used only by `npm run seed` and the dev-only sign-in shortcut, via `lib/supabase/admin.ts` (marked `server-only`).
- Storage uses the private `documents` bucket, at path `{organization_id}/{uuid}-{filename}`. Policies key on the first path segment. Downloads use signed URLs. The limit is 25 MB, with an allow-list of document, image and spreadsheet types.
- Participant files use a second private bucket with the same signed-URL, size and allow-list rules, keyed on organization and project. Participant data (and every view, download, export and deletion of it) is restricted to project admins and above plus owners.
- Validate every server action input with zod.
- Any new table or policy needs pgTAP coverage in `supabase/tests`: cross-org isolation for select, insert, update and delete, plus role checks.

## Terminology

- Never hard-code a primitive label (project, task, event, document, member, role names, participant and attendance words, status names, priority levels, task kinds) in UI code. Use `t(key, form)`: `useT()` in client components, or `getOrgContext(slug).t` on the server.
- `t` resolves the org override first, then the preset label, then the default (`lib/terminology/defaults.ts`).
- `npm run check:labels` enforces this. Fix the code, not the checker.

## Design

- Colour (D83). The base is the white/bone background, with navy #163260 for text and the sidebar. The accent (#0006BF by default) is for buttons, links, active states and focus. Status colours are fixed for everyone: green = good or done, amber = middle, red = bad or overdue. Priority colours are fixed for everyone: red = critical/high, orange = medium-high, yellow = medium, blue = low. Neutral chart data uses the accent and its tints. Brighter colours are for charts, dots, badges and icons; large surfaces stay calm. Use only theme tokens (the Tailwind palette is reset in `app/globals.css`). The logo keeps its own colours.
- Theming (D84). Dark mode is a per-user setting (light, dark or system). Orgs can set a logo and an accent colour; users can override the accent on their own screen unless their org turns that off. Status and priority colours are never themeable.
- Contrast (D85). Text must reach 4.5:1, and chart marks, dots and icons 3:1, in both modes. Any accent is lightness-adjusted automatically to pass. `lib/theme/theme.ts` and its unit tests enforce this. After changing a token, run `npm run theme:sync` to update `app/globals.css`.
- Branding (D86). Inside an org, its logo can replace the Groundwork logo, and a small "Powered by Groundwork" mark stays in the sidebar. The public pages, sign-in pages, emails and the maintenance page always use Groundwork branding. The Groundwork logo and its illustrations are in `components/logo.tsx` (D99); illustrations are default empty-state art that an org can switch off.
- No drop shadows. Use thin rules. Interaction shows through border and translate.
- Never signal status by colour alone. Use labels, icons, filled versus outlined badges, and bold type. Overdue is red with a dot, an icon and the word "Overdue". Priority is a flag icon plus a label, kept visually separate from status.
- Use ruled tables, not card grids; the dashboard widget grids are the one exception. Dashboards are read-only summaries filtered by permission in the database, and every chart mark links to an editable view or a read-only detail (D92). Layouts must be fully responsive with visible focus, full keyboard access, and correct aria labels and roles.

## How to work

- Run what you build. The checks are: `npx supabase test db`, `npm run typecheck`, `npm run lint`, `npm run check:labels`, `npm test`, `npm run build`, and `npm run test:e2e` (with Supabase running and `npm run seed` done).
- If a check fails, fix the cause. Never skip, weaken or delete a test to get it passing.
- If something can't run, say exactly what and list it as unverified.
- Commit after each meaningful milestone with a clear message.
