# DRAFT: decisions for the hub, plans and pre-launch work

Status: proposed, not yet accepted. Nothing here is built.
Numbering continues from D118, the last entry on `main` when this was drafted. Re-check the number before merging into `docs/decisions.md`.
Every entry marked **CLAUDE.md** needs that file updated in the same change, because today it forbids the thing.

## Open questions (owner to answer before these are accepted)

1. Do view-only seats see anything in Finance beyond budgets and reports for projects they can access?
2. Seat packs on Org (for example +5 seats), or a hard stop at 15 + 5 and then Ent?
3. Which email provider sends reminders and invitations? It must be reachable with `fetch`, so no new package is needed.
4. Which two or three starter templates ship first?

## D119. The product is a hub of two apps on one shared platform layer

**Decision.** Groundwork is sold as two apps: **Work** (the current core) and **Finance**. They share one platform layer: accounts, organizations, roles, notifications, documents and file storage, search, the calendar feed, member profiles, chat and discussions, and settings. Neither app requires the other. Each is usable alone and gains cross-links when both are on.

**Work** keeps: dashboard, programs/projects, tasks and board, calendar and reminders, documents, attendance and participants, discussions and chat, notifications and activity. It adds shift scheduling and in-app automation rules for work events.

**Finance** takes the existing Funds, Spending and funder-spending Reports, and adds timesheets (hours against a program and role rate), in-app automation rules for money events, and a standalone mode in which a program is a named cost centre. Progress, task and attendance reports stay in Work.

**Cross-links when both are on.** A grant deadline becomes a Work task and calendar event. A Work program is the same cost centre in Finance. Hours logged on a task become labour cost against a grant. A budget threshold creates a task. The Work dashboard gains a money widget. Funder reports can include attendance and progress.

**Navigation.** A narrow app rail with a Hub launcher. Finance is also the entry at the bottom of the Work sidebar, and Work is the entry at the bottom of Finance's. It opens in the same window by default (a modified click opens a new tab). Each app has its own route section with its own layout and accent colour, under one login and one organization. The Hub shows only apps the organization has; others read "Add".

**In scope, hours and cost only.** Time tracking records hours and cost allocation. Payroll, tax calculation, tax filing, remittances, client invoicing and money movement stay out. A funder statement (hours times rate plus approved expenses for a period) is a PDF or CSV document, with no payment taken.

**CLAUDE.md.** Add Finance (timesheets, in-app automation rules, funder statements) to scope. Keep "accounting, payments, payroll" forbidden and add "tax" and "client invoicing" explicitly. Replace the blanket "automations" ban with "automations other than in-app rules that act on Groundwork's own data (D119)".

**Costs.** Moving Funds, Spending and Reports to Finance changes the Work sidebar for existing users. Keep a link at the bottom of the Work sidebar so nothing appears lost, and carry data over unchanged.

## D120. Plans: Org and Ent, no Solo

**Decision.** Two plans.

- **Org**: up to 15 editing seats plus 5 view-only seats. Full Work app, roles, chat, attendance, logo, email support. Finance is an add-on.
- **Ent**: quote-based, not a published price. Larger seat counts, both apps included, audit export, priority support, guided onboarding, SSO later.

There is no Solo plan. A one-person organization can use a trial or the Org plan.

**Placeholder pricing, for the owner's testing only (CAD per month, two months free if paid annually).** Org about $199, Org with Finance about $249, Ent from about $499 as a stated floor. Founding-customer pricing for the first ten organizations is an option. These are assumptions to test with beta organizations. They are not code, and nothing in the product should hard-code a price.

**Why.** The buyer is a funded organization. Org differs from Ent on one axis, control and scale. A quote for Ent lets Ent start as a plan the owner sets by hand and invoices manually, with no Ent checkout or proration to build early.

**CLAUDE.md.** Remove "billing or plans" from the forbidden list and describe a per-organization plan value with seat limits. Payment collection stays out until a separate decision names a payment provider and any package it needs.

**Costs.** No cheap entry tier, so the audience is built through a trial, demos and the beta. Watch conversion from waitlist to trial.

## D121. A viewer role and seat counting

**Decision.** Add a **viewer** role below staff, so the ladder is owner, manager, admin, staff, viewer. A viewer can read what project visibility lets them see and can change nothing: no creating, editing, commenting or chat posting. In Finance a viewer sees budgets and reports for projects they can access, not spending entries or receipts (open question 1).

**Seat rules.**
- Seats are counted by type: editing (owner, manager, admin, staff) and view-only (viewer).
- Pending invitations count toward the type they were invited as.
- The owner counts as an editing seat.
- Changing someone between viewer and editor re-checks the cap.
- Project-level visibility rules apply to viewers exactly as to other roles.

**Why.** It suits board members, funders and volunteers, and it avoids a rule that every volunteer takes a seat.

**Needs.** A migration (role values and `has_permission`), interface changes that hide edit controls, and pgTAP coverage: cross-org isolation for select, insert, update and delete, plus role checks that a viewer cannot write anything.

**Timing.** Add the viewer role during the beta, because changing roles is easier before real organizations depend on them. Do not enforce seat limits yet (D122).

## D122. Seat limits: groundwork now, enforcement later

**Decision.** Now: a plan value on each organization and one security-definer function that returns seats allowed and used, per type. During the beta, limits are generous or off, and usage is observed. Later, when plans exist, enforcement is switched on in the database, at invitation creation and in `accept_invitation`, not only in the interface. There is no limit on people per program or per task: who sees a program or task stays governed by project membership.

**Why.** A limit only means something once it is tied to a price. Building the function early avoids a retrofit across invitations and member management.

**Needs.** pgTAP: an organization at its cap cannot add or accept another member of that type, one organization's cap never affects another's, and the last-owner rule still holds.

## D123. Less customization: two presets, fixed accents

**Decision.** This reverses part of D83 to D86 and the terminology settings.

- **Keep** the preset choice at sign-up (Nonprofit or Business), the `t()` mechanism internally, per-user light and dark mode, and the organization logo.
- **Remove** the Settings screen for renaming individual words (including status, role and section names), the organization accent, the personal accent, and the custom theme and contrast-validation screens.
- Each app has one fixed accent, so the apps stay distinguishable (Work in navy and blue, Finance in teal). Status is still never shown by colour alone.
- Consider merging the other presets into the two kept.

**Why.** Most customers will not use the flexibility, and each setting adds screens, tests and ways to end up with an unreadable page.

**Costs.** Organizations cannot use their own words or brand colours. For existing organizations with stored overrides, either map them to the nearest preset or keep the values and ignore them. If there is no real data, remove cleanly.

**CLAUDE.md.** Update the Terminology and Design sections to match.

## D124. Pre-launch must-haves for the Org price

These are what the Org price should be able to point to. In order:

1. **Email reminders and notifications.** Today notifications are in-app only (D88). Add due-date reminders and the invitation email, sent through a transactional email provider called with `fetch` (open question 3). Each person can switch reminder email off. Marketing email, SMS and push stay out. **CLAUDE.md** currently forbids "email or SMS communications"; reword to forbid only marketing email, SMS and push.
2. **CSV import.** Import participants, tasks and projects from a spreadsheet, with a preview and row-by-row error messages. Validate every row with zod. Imports obey the same role and visibility rules as manual entry, and are logged in the activity log. Exports already exist.
3. **Starter templates.** Sample content, not an onboarding flow: a ready-made youth-program or grant-cycle setup that creates real projects, tasks and dates (open question 4). `CLAUDE.md` forbids building onboarding, so these are content only.
4. **Reliability and trust.** Documented backups, an uptime and status page, and a clear statement of data ownership and export. The security page already exists.
5. **Support.** A named support address, a stated response time, and a short help centre.
6. **Phone-width polish** across every screen, since staff check tasks and attendance on phones.

**Needs.** Items 1 and 2 are new code and need pgTAP and e2e coverage. Items 4 to 6 are mostly operations and content.

## Changes to `CLAUDE.md` implied by the above

- Scope: add Finance and its extensions (D119); allow in-app automation rules; allow plans and seat limits; allow reminder and invitation email; add CSV import.
- Forbidden, kept or sharpened: accounting, payments, payroll, tax, client invoicing, marketing email, SMS, push.
- Design and terminology: remove the accent and custom-theme rules and the per-word terminology editor (D123).
- Data and security: add the viewer role to the role ladder, and the rule that seat limits are enforced in the database.
