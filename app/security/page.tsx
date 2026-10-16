import type { Metadata } from "next";
import { MarketingShell, ProsePage, ProseSection } from "@/components/marketing/shell";
import { createTranslator, lower } from "@/lib/terminology/t";
import { CONTACT_EMAIL } from "@/lib/maintenance";
import { MAX_UPLOAD_BYTES } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Security",
  description: "Who can see what in Groundwork, where your data is stored, and how files and sign-in are protected.",
};

/** Plain-language security, accurate to the code (CLAUDE.md "Data and security"). */
export default function SecurityPage() {
  const t = createTranslator();
  const role = (r: "owner" | "manager" | "admin" | "staff") => lower(t(`role.${r}`, "other"));
  return (
    <MarketingShell>
      <ProsePage
        title="Security"
        lead="Who can see what, where your data lives, and how it's protected. Written in plain language and kept accurate to how Groundwork actually works."
        updated="October 14, 2026"
      >
        <ProseSection id="separate" title="Your organization's data stays yours">
          <p>
            Every piece of data belongs to one organization, and the rules that keep organizations apart live in the database itself
            (row-level security), not just in the app. Even a mistake in a page can&apos;t show one organization&apos;s data to another.
          </p>
        </ProseSection>

        <ProseSection id="who" title="Who can see what">
          <ul>
            <li>
              People have one of four roles, from most to least access: {role("owner")}, {role("manager")}, {role("admin")} and{" "}
              {role("staff")}. Nobody can give someone a role above their own.
            </li>
            <li>
              People only see the {lower(t("project", "other"))} they&apos;ve been added to, with everything in them: {lower(t("task", "other"))},
              files, {lower(t("section.calendar"))} items and activity. {t("role.owner", "other")} see every {lower(t("project"))}.
            </li>
            <li>
              What someone creates can&apos;t be changed or deleted by anyone ranked below them, except the person it&apos;s assigned to, who can
              still mark a {lower(t("task"))} done.
            </li>
            <li>
              Details about the people you serve (contact details, guardians, emergency contacts, medical and accessibility notes,
              {lower(t("section.attendance"))}) are visible only to {role("owner")} and to the {lower(t("project_role.admin", "other"))} and{" "}
              {lower(t("project_role.lead", "other"))} of the {lower(t("project", "other"))} those people are enrolled in.
            </li>
            <li>Funds and how they&apos;re split are visible only to {role("owner")} and {role("manager")}.</li>
          </ul>
        </ProseSection>

        <ProseSection id="files" title="Files">
          <p>
            Files are kept in private storage. Nothing has a public address: each download goes through a link that&apos;s created for that
            person and expires after a minute. Uploads are limited to {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB and to office files
            (text, spreadsheets and presentations), PDFs, plain text and images.
          </p>
        </ProseSection>

        <ProseSection id="signin" title="Signing in">
          <p>
            Groundwork has no passwords. You sign in with your Google account or with a one-time link sent to your email. Invitations can only be
            accepted from the email address they were sent to, once that address is confirmed.
          </p>
        </ProseSection>

        <ProseSection id="history" title="A record of changes">
          <p>
            Groundwork keeps an activity log of what was created, changed, completed and deleted, and by whom. Nobody can edit its entries;
            only {role("owner")} can delete them. Entries follow the same visibility rules as everything else.
          </p>
        </ProseSection>

        <ProseSection id="hosting" title="Where your data is stored">
          <p>
            Your data and files are stored with Supabase, in its US East region in the United States. The app is served by Vercel. Every
            connection uses HTTPS, and browsers are told to use it every time.
          </p>
          <p>
            Groundwork doesn&apos;t offer restorable backups yet, so keep your own copies of files you can&apos;t afford to lose. We&apos;ll update
            this page when that changes.
          </p>
        </ProseSection>

        <ProseSection id="report" title="Found a problem?">
          <p>
            If you think you&apos;ve found a security issue, please email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>{" "}
            before sharing it anywhere else.
          </p>
        </ProseSection>
      </ProsePage>
    </MarketingShell>
  );
}
