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

## App behaviour

**D16. Time zones.** The browser reports its IANA time zone in a `tz` cookie, set by `ClientCookies` in the org shell, which refreshes once if the zone changes. Server components render "today", due states and event times in that zone, defaulting to UTC before the cookie exists. The event form also posts the browser's zone, and the server converts wall-clock input to UTC with `zonedTimeToUtc`, which has unit tests including DST. Due dates are plain calendar dates with no time zone.

**D17. Calendar weeks start on Monday.** This is the ISO convention and suits the Canadian/UK spelling in the brief. It's one constant (`monthGrid`, `WEEKDAYS` in `lib/dates.ts`) if Sunday is wanted.

**D18. Fixed formatting locale.** Dates and times are formatted with `en-US` rather than the server's default locale, so server and browser render identical strings and hydration never mismatches.

**D19. The theme is the navy family only. Please review.** The brief lets admins change "only the navy base colour". Beyond the 4.5:1 contrast gate, the base must also be a navy: HSL hue 195–250°, saturation at most 70%, lightness at most 50%. Without this, an admin could pick red or green and break the two-scale rule. If you'd rather allow any hue that passes contrast, delete `isNavyFamily` from `validateTheme`.

**D20. Theme derivation.** In light mode, the rail is the brief's exact `#555E74` for the default navy. For a custom navy, it's that navy at 76% over bone-50, a solid colour. Rail hover darkens toward navy rather than lightening, because lightening fails contrast for mid navies. In dark mode, the same scales invert: the work area is navy at 50% over black, panels are navy at 72%, the rail is the navy itself, and text is bone. Nine text/background pairs are checked (`checkContrast`). A stored theme that somehow fails is never rendered; the default is used instead.

**D21. Theme and mode are per organization.** The brief puts the light/dark switch in the admin's theme settings, so it applies to everyone in the org. There's no personal override.

**D22. Projects tabs.** **All** lists every project with a status badge, active first. **Archived** lists only archived projects. Archived projects drop out of pickers (quick-add, filters) and out of "Recent".

**D23. Uploads go straight to storage.** Vercel functions cap request bodies at 4.5 MB, so files never pass through a server action. Instead, `requestUpload` validates the name, size and type with zod and returns a signed upload URL for a **server-chosen** path. The browser uploads to that URL, then `finishUpload` re-reads the real size and content type from storage, checks them against the same limits, and inserts the row. The bucket enforces the limits a third time. Deleting a document deletes the row (RLS decides who may), then the file. If the file removal fails, it's logged rather than shown to the user.

**D24. Preset words beyond the brief.** The brief fixes Program/Task/Session, Project/Task/Meeting and Subject/Task/Lesson. I also gave Nonprofit "Team member" and Tutoring "Tutor" and "Material", to show that every primitive relabels. They live in the presets migration. Status names, role names and section names are terminology keys too, editable in Settings → Terminology.

**D25. The dashboard layout saves on every change.** Each reorder, resize, hide or show saves immediately, through a serialized queue so the last change wins. Waiting for "Done" would lose work on an accidental reload. Stored layouts are normalized on load: unknown widgets are dropped, duplicates collapsed, and widgets added since the save are appended. Sizes map to columns of a 12-column grid: S = 4, M = 6, L = 12 on wide screens; S and M = 6 on tablets; everything full width on phones.

**D26. Reminders.** The brief allows in-app reminders only. Every page shows due-state badges ("Overdue" filled with an icon; due within 2 days outlined with a clock). The dashboard also has a Reminders strip that counts *your own* overdue and due-soon tasks, linking to the filtered list. The "Overdue" and "Due in 7 days" widgets are organization-wide.

**D27. Keyboard paths on the board.** There are two. First, dnd-kit's keyboard sensor: Space to lift, arrow keys, Space to drop. A custom coordinate getter makes Left/Right jump a whole column, because the default getter mis-targets cards in the same column. Second, explicit "Move to {status}" arrow buttons on every card. The dashboard uses dnd-kit's sortable keyboard coordinates as is. Both `DndContext`s get a stable `id` so server and client render the same `aria-describedby`.

**D28. Activity sentences** are built from the activity log plus `t()`, e.g. "Priya completed a task", so they relabel with the preset like everything else.

**D29. check:labels uses the TypeScript AST.** It inspects JSX text, copy attributes (aria-label, placeholder, title, alt, label) and sentence-like string literals for primitive words, including every preset's words. It ignores class lists, routes, query and select strings, and `t()` keys. Status phrases ("To do", "In progress") are matched only in label form. It flagged several "session"/"member" collisions in non-label copy ("Your session has ended"), and those were reworded rather than allow-listed. The checker has its own unit tests.

**D30. Members may leave.** The delete policy on memberships lets a member remove their own row. The last-admin guard still applies, so the only admin can't leave.

## Seed and tests

**D31. The seed is idempotent by rebuild.** `npm run seed` reuses the four demo users (creating them on first run) and then deletes and recreates only the "Northside Youth Collective" org and its storage objects, so dates stay relative to today. Running it twice leaves one org, 25 tasks and 6 files. It writes with the service-role key; the activity triggers attribute rows to `created_by`, so the activity feed shows real names. The six documents are generated in code as real files: Markdown, CSV, plain text, a hand-built PDF and a PNG.

**D32. Dev sign-in shortcut.** A server action calls `auth.admin.generateLink` with the service-role key, then `verifyOtp` with the hashed token on the cookie-bound client, so the session cookie is set exactly as a real magic link would set it. It only accepts the four seeded emails. It refuses when `NODE_ENV` is production or when no service key is configured, and the buttons aren't rendered in either case. I checked this against `next start`.

**D33. Test hooks.** The org shell sets `html[data-hydrated]` after mount, and the e2e tests wait for it after full page loads so keyboard input never races hydration. Playwright 1.63 expects a newer Chromium build than the one preinstalled here, so `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides the browser binary when set.

**D34. pgTAP fixtures.** All test files share `supabase/tests/fixtures.inc` through psql's `\ir`. It isn't a `.sql` file, so it doesn't run as a test itself. It defines two organizations, five users, and a `tests.affected(sql)` helper that runs a statement as the current role and returns the row count, because data-modifying CTEs can't be nested inside `select is(...)`.

## Deployment

**D35. Deployment runs in GitHub Actions.** The build sandbox can't reach the Supabase or Vercel APIs, and deploying needs your accounts anyway, so CI/CD lives in `.github/workflows`. **CI** runs every check from CLAUDE.md on each PR, including pgTAP and Playwright against a local Supabase in Docker. **Deploy** runs only after CI succeeds on a push to `main`, or when started by hand. Without its settings, it writes a summary of what's missing and exits successfully, so an unconfigured fork never shows a red build.

**D36. The Vercel build happens in Actions (`vercel build` then `deploy --prebuilt`), not through Vercel's Git integration.** That way one pipeline orders the steps: database migrations first, then the app, then auth configuration, then a smoke test. `NEXT_PUBLIC_*` values are inlined at build time, so the Vercel project needs no environment variables of its own. The workflow reads the Supabase URL and browser-safe key from the Supabase API. The deployed app has no service-role key at all.

**D37. Auth is configured by the pipeline.** `scripts/deploy/configure-auth.ts` uses the Supabase Management API to set the site URL and to allow redirects only to `<production URL>/**`. This deliberately leaves out a `*.vercel.app` wildcard, which would let any Vercel app receive sign-in redirects. It also sets custom SMTP when `SMTP_*` settings exist. Preview deployments therefore can't complete a magic-link sign-in unless their URLs are added through `EXTRA_REDIRECT_URLS`.

**D38. The Vercel CLI isn't a dependency.** The workflow runs it pinned to major version 62 (`npx --yes vercel@62`), so nothing is added to `package.json` for a tool only CI uses. `vercel.json` pins the framework to Next.js, so a project created by the CLI builds correctly on its first deploy.

## Production-readiness fixes

A multi-agent review looked for things that would break on Vercel and hosted Supabase but not locally, and adversarially verified each finding. These decisions came out of it.

**D39. Sign-in links use a token hash and a confirm button.** The default Supabase email links to `/auth/v1/verify`, which uses up the one-time token on the first GET. Corporate mail scanners such as Defender Safe Links and Mimecast make that GET before the person clicks, so sign-in would fail for whole organizations. The PKCE code also needs the verifier cookie from the browser that asked for the link, so opening it on a phone or in a mail app's built-in browser failed every time. Groundwork's templates (`supabase/templates/`) now link to `/auth/confirm?next=…&token_hash=…`. That page only renders a **Continue to Groundwork** button, and a POST server action calls `verifyOtp`. The `?code=` path in `/auth/callback` remains for links already sent with the default template. Its GET `token_hash` branch is gone, because it allowed login CSRF with a link alone.

**D40. Redirect targets are parsed, not prefix-matched.** `safeNext` rejects control characters and backslashes and requires the value to resolve to the same origin. Browsers strip tabs and newlines from URLs, so `/%09/evil.com` used to pass the old prefix check and then resolve to `//evil.com`.

**D41. Production serves one canonical host.** When `NEXT_PUBLIC_SITE_URL` is set in a production build, the proxy 308-redirects every other host to it, for example the `*.vercel.app` alias next to a custom domain. Sign-in redirects are allow-listed for that host only, and cookies are per host. The deploy pipeline resolves the production URL before building, so the value is always set. Local hosts are exempt.

**D42. Account deletion works.** `forbid_column_changes` now allows a change to NULL made by a foreign-key cascade (`pg_trigger_depth() > 1`). Before this, deleting any auth user who had created something failed. A client update setting `created_by` or `uploaded_by` to NULL is still refused. The person's projects, tasks, events, documents and invitations stay, unattributed. The cascade isn't logged as edits. Deleting the last admin of an organization is still refused.

**D43. Slugs are truncated before trimming.** Long org names whose 40th slug character was a separator used to fail `create_organization`.

**D44. Upload metadata is checked before the file is sent.** The browser validates name, tags and project with the same zod schema as the server. If the server still rejects them, it deletes the just-uploaded object, so retries never pile up orphaned files.

**D45. Not done: CAPTCHA on sign-in.** Anyone can request sign-in emails, so a bot could use up the project's hourly email quota and lock real users out until it stops. The fix is Supabase's built-in CAPTCHA support with Cloudflare Turnstile. That needs a Cloudflare account and a third-party script, so it's left for the owner to decide.

**D46. Forms keep what was typed when the server says no.** React 19 resets uncontrolled fields whenever a form `action` resolves, including when it returns a validation error. A rejected project lost its name and description, and a rejected upload lost the chosen file. Forms with user input now submit through `keepValues()` (`lib/forms.ts`), which calls `onSubmit` and then dispatches in a transition. Their buttons take `useActionState`'s pending flag. Confirmation-only forms with no inputs keep the plain `action` prop.
