# Groundwork: standing rules

These rules come from the original build brief (docs/BRIEF.md). They apply to every change. Record any decision the rules leave open in docs/decisions.md.

Next.js 16 differs from older versions; read AGENTS.md and the bundled docs in `node_modules/next/dist/docs/` before changing framework code.

## Scope

- Groundwork is a workplace management platform for program-based organizations. The product is one dashboard plus projects, tasks, documents and a calendar with reminders.
- Do not build onboarding, employee directories, certifications, finance, communications, automations or integrations. Do not add sidebar items, routes or tables for them.
- Nothing shipped may be a placeholder, a TODO, or lorem ipsum.

## Stack

- Next.js App Router, TypeScript strict, Tailwind CSS, and Supabase (Postgres, magic-link auth, storage, RLS) run locally with the Supabase CLI and deployed on Vercel.
- Pre-approved packages: @supabase/supabase-js, @supabase/ssr, zod, @dnd-kit/core, @dnd-kit/sortable, lucide-react, vitest, @playwright/test, tsx. Add nothing else without a written reason in docs/decisions.md.
- Fonts come from next/font: Archivo for headings and chrome, Source Sans 3 for body text and tables.
- Animation is CSS only. No animation library. Every animation stops under `prefers-reduced-motion`.
- Use server components by default. Use client components only where interaction needs them.

## Data and security (non-negotiable)

- Migrations live in `supabase/migrations`, one per concern, with RLS in the same migration as its table.
- Every org-scoped table has `organization_id`. The only global tables are `presets` (read-only to authenticated users) and `profiles` (one row per auth user).
- Every table has select, insert, update and delete policies. Policies use the security-definer helpers `is_member(org)` and `has_role(org, role)` so they never recurse.
- Admins handle settings and members and can delete anything. Members create and edit projects, tasks, events and documents, and see everything in their org.
- Org creation and invite acceptance go through the SECURITY DEFINER functions `create_organization` and `accept_invitation`. The last admin can never be removed or demoted.
- Never expose the service-role key to the client. It is used only by `npm run seed` and the dev-only sign-in shortcut, via `lib/supabase/admin.ts` (marked `server-only`).
- Storage uses the private `documents` bucket, at path `{organization_id}/{uuid}-{filename}`. Policies key on the first path segment. Downloads use signed URLs. The limit is 25 MB, with an allow-list of document, image and spreadsheet types.
- Validate every server action input with zod.
- Any new table or policy needs pgTAP coverage in `supabase/tests`: cross-org isolation for select, insert, update and delete, plus role checks.

## Terminology

- Never hard-code a primitive label (project, task, event, document, member, status names) in UI code. Use `t(key, form)`: `useT()` in client components, or `getOrgContext(slug).t` on the server.
- `t` resolves the org override first, then the preset label, then the default (`lib/terminology/defaults.ts`).
- `npm run check:labels` enforces this. Fix the code, not the checker.

## Design

- Use two colour scales only, navy and bone. Nothing else anywhere: no orange, olive, red, green or grey. Derive every border, hover and tint from those two. The Tailwind palette is reset in `app/globals.css`, so only theme tokens exist. The logo keeps its own colours.
- No drop shadows. Use thin bone-300 rules. Interaction shows through border and translate.
- Never signal status by colour alone. Use labels, icons, filled versus outlined badges, and bold type. Overdue is a filled navy badge with an icon and the word "Overdue".
- Theme changes that drop text contrast below 4.5:1 are rejected (`lib/theme/theme.ts`).
- Use ruled tables, not card grids; the dashboard widget grid is the one exception. Layouts must be fully responsive with visible focus, full keyboard access, and correct aria labels and roles.

## How to work

- Run what you build. The checks are: `npx supabase test db`, `npm run typecheck`, `npm run lint`, `npm run check:labels`, `npm test`, `npm run build`, and `npm run test:e2e` (with Supabase running and `npm run seed` done).
- If a check fails, fix the cause. Never skip, weaken or delete a test to get it passing.
- If something can't run, say exactly what and list it as unverified.
- Commit after each meaningful milestone with a clear message.
