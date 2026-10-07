# Groundwork: build brief

Build Groundwork end to end, as a working application, in this directory. Do not stop for plan approval; make reasonable decisions yourself, record each in docs/decisions.md, and keep going until everything in "Definition of done" is true. Nothing you ship may be a placeholder, a TODO, or lorem ipsum.

## What it is

Groundwork is a workplace management platform for program-based organizations (nonprofits, youth programs, tutoring centres, small teams) that is generic enough for any business to use. One central dashboard to manage projects, their tasks, documents, and a calendar with reminders. Terminology is configurable so the same app reads as a nonprofit tool or a business tool.

## Stack

All of this is pre-approved; add nothing else without a written reason in docs/decisions.md.

- Next.js App Router + TypeScript (strict), Tailwind CSS
- Supabase (Postgres, magic-link auth, storage, RLS), run locally via the Supabase CLI, deployable on Vercel
- Pre-approved packages: @supabase/supabase-js, @supabase/ssr, zod, @dnd-kit/core, @dnd-kit/sortable, lucide-react, vitest, @playwright/test, tsx
- Fonts via next/font: Archivo (headings, chrome) and Source Sans 3 (body, tables)
- Animation is CSS only. No animation library.

## Data model

Migrations live in supabase/migrations, one per concern, with RLS in the same migration as its table. Every org-scoped table has organization_id. Global exceptions: presets (read-only to authenticated users) and profiles (one row per auth user).

- presets(id, key, name, labels jsonb, theme jsonb, starter_content jsonb)
- organizations(id, name, slug unique, preset_key, terminology_overrides jsonb, theme jsonb, created_at)
- profiles(id = auth.users.id, full_name, email)
- memberships(id, organization_id, user_id, role admin|member, created_at, unique(organization_id, user_id))
- invitations(id, organization_id, email, role, token, invited_by, expires_at, accepted_at)
- projects(id, organization_id, name, description, status active|archived, color, owner_membership_id, start_date, end_date, created_by, created_at, updated_at)
- tasks(id, organization_id, project_id, title, description, status todo|in_progress|done, assignee_membership_id nullable, due_date nullable, position, completed_at, created_by, created_at, updated_at)
- events(id, organization_id, project_id nullable, title, description, starts_at, ends_at, all_day, location, created_by)
- documents(id, organization_id, project_id nullable, name, storage_path, mime_type, size_bytes, tags text[], pinned, uploaded_by, search tsvector generated from name + tags, created_at)
- activity_log(id, organization_id, actor_membership_id, entity_type, entity_id, action, metadata jsonb, created_at)
- dashboard_layouts(id, organization_id, membership_id, layout jsonb, updated_at). RLS: a member can read and write only their own row.

## Multi-tenancy and security (non-negotiable)

- Security-definer helpers is_member(org_id) and has_role(org_id, role) that avoid policy recursion. Policies on every table for select, insert, update, and delete.
- Roles: admin (settings, members, delete anything) and member (create and edit projects, tasks, events, documents; see everything in their org).
- SECURITY DEFINER functions: create_organization(name, preset_key) creates the org and the admin membership atomically; accept_invitation(token) checks the invite is unexpired and that the signed-in user's email matches. Never expose the service-role key to the client. Prevent removing or demoting the last admin.
- Storage: private "documents" bucket, path {organization_id}/{uuid}-{filename}; storage policies key on the first path segment. Downloads use signed URLs. Max 25 MB; allow-list common document, image, and spreadsheet types.
- Write pgTAP tests (supabase/tests) proving: org A cannot read, insert, update, or delete org B's rows in every table; a member cannot do admin actions; storage objects are isolated; invitations cannot be accepted by the wrong user; dashboard_layouts rows are private to their owner.

## Terminology and presets

t(key, form) resolves in order: org override, preset label, default. Keys cover project, task, document, event, member, status labels, and section names, each with singular and plural. Never hard-code a primitive label in a component; add a lint or grep check (npm run check:labels) that fails if one appears.

Presets: Nonprofit (Program / Task / Session), Business (Project / Task / Meeting), Tutoring (Subject / Task / Lesson). Switching the preset relabels the whole UI with zero code change.

## Shell and routes

Routes: /login, /auth/callback, /create-organization, /invite/[token], /[orgSlug]/dashboard|projects|tasks|calendar|documents|settings.

Sidebar items and tabs. The contextual tab strip appears below the page title only where a section has more than one view.

| Section | Tabs |
| --- | --- |
| Dashboard | none |
| {Projects} | All, Archived |
| {Tasks} | Board, List |
| Calendar | Month, Agenda |
| Documents | none |
| Settings | Preset, Terminology, Theme, Members, Organization |

Do not build onboarding, employee directories, certifications, finance, communications, automations, or integrations, and do not add sidebar items, routes, or tables for them.

## Features (all must work, with loading, empty, and error states, and server-validated inputs via zod)

1. **Auth:** magic-link sign-in; a new user creates an org and becomes admin; admins invite by email, copy the invite link, and manage roles and removal in Settings > Members. Users may belong to several orgs.
2. **Projects:** create, edit, archive, delete; detail page showing its tasks, events, and documents.
3. **Tasks:** board (drag between todo, in_progress, and done, AND a keyboard path to move cards) and list (sortable, filterable by project, assignee, status, and due date). One assignee, one due date, one status. Inline quick-add.
4. **Calendar:** hand-built month grid and agenda list showing tasks by due date and events; create and edit events; click a task to open it; today highlighted.
5. **Dashboard:** an interactive widget grid. Widgets: Overdue, Due in 7 days, My tasks, Project progress, Upcoming events, Recent activity, Pinned documents, Quick add. A "Customize" button enters edit mode, where widgets can be dragged to reorder (dnd-kit, with keyboard sensors so it works without a mouse), switched between S/M/L sizes with a control, and hidden or shown. The layout saves per member in dashboard_layouts and restores on load. Animation (CSS only, all disabled under prefers-reduced-motion): widgets stagger-fade in on load; counters count up; progress bars fill; checking a task strikes it through and slides it out; widgets lift a few pixels on hover (translate, no shadow) and settle with a short spring when dropped. In-app reminders for due-soon and overdue tasks are the only reminders for now.
6. **Documents:** upload, tag, pin, search by name and tag, filter by project, download, delete (admin or uploader).
7. **Settings:** choose preset, edit terminology overrides, theme (admin changes only the navy base colour and light/dark mode; the rail tint is derived automatically; reject any change that drops text contrast below 4.5:1), edit org name and slug, manage members.
8. **Seed script (npm run seed, idempotent):** demo org "Northside Youth Collective" with 1 admin and 3 members, 3 projects, about 25 tasks with due dates relative to today (some overdue, some upcoming), 8 events, and 6 real small documents uploaded to storage. Add a dev-only sign-in shortcut for seeded users, hidden when NODE_ENV is production.

## Design

**Colour system.** Two scales only, navy and bone. Nothing else anywhere in the app: no orange, olive, red, green, or grey. Derive every border, hover, and tint from tints and shades of these two.

- `--navy-900` #1F2D4D: text, filled buttons
- `--rail` #555E74: sidebar (navy at about 75% over bone, as a SOLID colour so text on it is never see-through)
- `--bone-50` #FBF9F4: main work area
- `--bone-100` #F5F1E8: panels, hover, logo badge
- `--bone-300` #DDD6C8: rules and borders

Dark mode inverts the same two scales (bone text on deep navy). Never signal status by colour alone: use labels, icons, filled vs outlined badges, and bold type (overdue = filled navy badge + icon + "Overdue"). No drop shadows. Use thin bone-300 rules; interaction is shown by border and translate, not shadow.

The logo is the one exception to the two-colour rule, because it uses its own colours.

**Sidebar (modeled on the Claude app sidebar).**
- Logo top-left: the provided `assets/logo.svg` (a stick figure with a construction helmet and briefcase), copied to public/ and used as the favicon. Show it on a small bone rounded badge on the rail, with the "Groundwork" wordmark beside it. It is the home button (links to the dashboard). Inline the SVG as a React component and wrap the elements after the "construction helmet" comment in a group so the helmet tips up a few degrees on hover; wrap the briefcase elements in another group that swings slightly every few seconds. Both animations stop under prefers-reduced-motion.
- Expanded (260px) and collapsed icon-only (64px) states with a toggle; the choice persists in a cookie. Under 900px it becomes a slide-over with a focus trap and Escape to close.
- Nav items with lucide icons: Dashboard, {Projects}, {Tasks}, Calendar, Documents. Settings sits at the bottom.
- Under the nav, a "Recent {projects}" list built from activity_log.
- Bottom: org switcher and user menu (sign out). Active item: filled bone-100 background with navy text.

**General.** White work area, ruled tables, no card grids. Fully responsive. Visible focus states, full keyboard access, aria labels and roles, prefers-reduced-motion respected. Server components by default; client components only where interaction needs them.

## How to work

- git init; commit after each milestone with a clear message. Milestones in order: scaffold and tooling; schema, RLS, and pgTAP tests; auth and orgs; terminology and presets; shell, sidebar, and theming; projects; tasks; calendar; dashboard (widgets and animation); documents; settings; seed; polish, docs, and verification.
- Run everything you build. Use supabase start, supabase db reset, supabase test db, npm run typecheck, npm run lint, npm run check:labels, vitest (t() and contrast logic), npm run build, then start the dev server and exercise the main flows with a Playwright smoke test: sign in, create a project and task, move the task, add an event, upload and find a document, switch preset, reorder a dashboard widget, reload, and confirm the order persisted.
- If a check fails, fix the cause; never skip, weaken, or delete a test to pass.
- If something cannot run (for example Docker is unavailable), say exactly what, finish the rest, and list it as unverified.
- Include README.md (setup, scripts, env vars, how magic links work locally via the Supabase mail catcher, Vercel deploy steps), .env.example, and a CLAUDE.md holding the standing rules in this brief.

## Definition of done

A fresh clone can follow the README and reach a seeded, working app. All migrations apply; pgTAP, vitest, typecheck, lint, check:labels, and build pass; and the Playwright smoke test passes. Finish with a short report: what was built, what was verified and how, what was not verified, and any decision that deserves my review.
