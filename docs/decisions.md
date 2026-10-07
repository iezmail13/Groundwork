# Decisions

Each entry records a decision the brief left open, why it was made, and what it costs. Newest milestones are at the bottom.

## Tooling and stack

**D1. Packages beyond the pre-approved list.** The stack itself implies a few packages the list doesn't name: `next`, `react`, `react-dom`, `typescript`, `@types/*`, `tailwindcss` with `@tailwindcss/turbopack` (the Tailwind 4 loader that Next 16 scaffolds), `eslint` with `eslint-config-next`, and `supabase` (the Supabase CLI, pinned as a dev dependency so `npx supabase` works the same on a fresh clone). Nothing else was added. There is no date library, class-name helper, toast library or animation library.

**D2. Next.js 16.4 without `cacheComponents`.** The 16.4 scaffold turns on `cacheComponents` and `partialPrefetching`. Every page in Groundwork is per-user and per-organization behind auth, so there is no useful static shell to prerender. Leaving it off keeps default dynamic rendering and avoids wrapping every data read in a Suspense boundary. Turbopack is the default bundler for both dev and build.

**D3. `proxy.ts` instead of `middleware.ts`.** Next 16 renamed middleware to proxy. The proxy refreshes the Supabase session cookie and redirects signed-out visitors to `/login`.

## Schema and security

**D4. Migration granularity.** There is one migration per concern, with RLS in the same file as its table. `profiles`, `organizations` and `memberships` share a single "tenancy" migration because their policies depend on each other: profiles are visible to people who share an organization, and memberships reference profiles. Splitting them would have meant adding policies in a later file than the table they protect.

**D5. Same-organization foreign keys.** Every cross-table reference that must stay inside one organization is a composite foreign key on `(id, organization_id)`. This covers a task's project, owner and assignee memberships, an event's or document's project, the actor in the activity log, and a dashboard layout's membership. The database itself rejects a task in org A that points at a project in org B, whatever RLS allows. Nullable references use `on delete set null (column)` (Postgres 15+) so a cascade never nulls `organization_id`.

**D6. Who can delete.** The brief gives admins "delete anything" and members "create and edit". Members may also delete projects, tasks, events and documents **they created**, which mirrors the brief's explicit rule for documents ("admin or uploader"). Admins can delete anything. Without this, a member who mistyped a task couldn't remove it.

**D7. Immutable columns.** A generic `forbid_column_changes(...)` trigger stops `organization_id`, `created_by` and similar columns from changing on update. That blocks moving a row into another organization or re-attributing it. Column-level grants also limit what clients can update on `organizations`, `memberships` and `profiles`.

**D8. The activity log is written by triggers.** Projects, tasks, events and documents log their own changes in a `SECURITY DEFINER` trigger, attributed to the caller's membership. This works no matter which client made the change. Reorder-only task updates and cascades from deleting a project or organization are not logged. The table is append-only for clients: there is no update grant and the update policy is `false`. Admins may delete entries.

**D9. Explicit deny policies.** The brief asks for select, insert, update and delete policies on every table. Where an operation is never allowed for clients, the policy exists and is `false`: presets writes, direct organization inserts, profile deletes and activity-log updates. A pgTAP test checks that every public table has all four policies.

**D10. Invitations aren't emailed.** Admins create an invitation for an email address and copy its link (`/invite/{token}`). Sending it would need a transactional email provider, which isn't in the approved stack. Supabase's `inviteUserByEmail` would also create the auth user and skip the "accept" step. The invitation still enforces that the signed-in email matches. Tokens are 64 hex characters from two `gen_random_uuid()` calls, which avoids depending on `pgcrypto`. Only admins can read invitations because the tokens are secrets. The invite page previews an invitation through `get_invitation(token)`.

**D11. Recent projects are organization-wide.** The sidebar's "Recent {projects}" list comes from `recent_projects(org)`. It ranks active projects by the latest activity on the project or anything in it, from anyone in the organization. A personal feed would be empty for new members.

**D12. Document search.** `documents.search` is a stored generated `tsvector` (`simple` config) built from the raw name, the name with punctuation turned into spaces, and the tags. That makes `budget-2026.pdf` findable by "budget" or "2026". `array_to_string` is only `STABLE`, so a small `IMMUTABLE` wrapper (`tags_to_text`) makes the generated column legal. Tags are stored lowercase, enforced by a check constraint.

**D13. Storage.** The `documents` bucket is created in a migration rather than in `config.toml`, so it exists on hosted Supabase too. The migration sets it private, caps files at 25 MB and applies a MIME allow-list. The allow-list covers PDF, Word, Excel, PowerPoint, OpenDocument, RTF, plain text, CSV, Markdown, PNG, JPEG, GIF and WebP. SVG is deliberately excluded because it can carry script. Storage policies resolve the first path segment with `storage_org_id(name)`, which returns null for anything that isn't a UUID, so stray paths are rejected.

**D14. All-day events.** These are stored as UTC midnight to UTC midnight of the next day and shown by their UTC date, so an all-day event never shifts to a neighbouring day for viewers in other time zones.

**D15. Starter content.** `presets.starter_content` holds one "Getting started" project with three dated tasks. `create_organization` inserts it, so a new organization opens on a dashboard with something in it rather than eight empty widgets.
