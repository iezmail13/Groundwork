import Link from "next/link";
import { createTranslator, lower } from "@/lib/terminology/t";
import { CONTACT_EMAIL, type MaintenanceSetting } from "@/lib/maintenance";
import { MAX_UPLOAD_BYTES } from "@/lib/validation";
import { LandingMaintenanceNotice } from "@/components/maintenance/notices";
import { Hero } from "./hero";
import { MarketingShell } from "./shell";
import { Benefits, FaqSection, FinalCta, HowItWorks, Problems, type Faq } from "./sections";

/** The public page signed-out visitors see at /. */
export function Landing({ maintenance, timeZone }: { maintenance: MaintenanceSetting; timeZone: string }) {
  // no organization here, so the built-in default labels
  const t = createTranslator();
  const faqs: Faq[] = [
    {
      q: "Is my data safe?",
      a: (
        <>
          <p>
            Each organization&apos;s data is kept apart by rules in the database itself, not just in the app. People only see the{" "}
            {lower(t("project", "other"))} they&apos;re on, and details about the people you serve are limited to the{" "}
            {lower(t("project_role.admin", "other"))} and {lower(t("project_role.lead", "other"))} of their {lower(t("project", "other"))} and your{" "}
            {lower(t("role.owner", "other"))}.
          </p>
          <p>
            Files are stored privately and open through links that expire after a minute. Sign-in is with Google or a one-time email link, so
            there are no passwords to steal. <Link href="/security" className="font-semibold text-ink underline underline-offset-4">More about security</Link>.
          </p>
        </>
      ),
    },
    {
      q: "Where is it stored?",
      a: (
        <p>
          Your data and files are stored with Supabase in its US East region, in the United States. The app itself is served by Vercel. If your
          organization needs its data kept in Canada, email us before you start.
        </p>
      ),
    },
    {
      q: "How long does setup take?",
      a: (
        <p>
          Creating your account and organization takes a couple of minutes. You start with a sample {lower(t("project"))} to try things out,
          then invite your team and add your own.
        </p>
      ),
    },
    {
      q: "Can I import files?",
      a: (
        <p>
          You can upload files one at a time, up to {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB each: PDFs, Word, Excel and PowerPoint
          files, OpenDocument files, text, CSV and Markdown files, and images. There&apos;s no bulk import yet.
        </p>
      ),
    },
    {
      q: "What does it cost?",
      a: (
        <p>
          Starting is free, with no credit card. We haven&apos;t published pricing for larger organizations yet: email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ink underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{" "}
          and we&apos;ll talk it through.
        </p>
      ),
    },
  ];

  return (
    <MarketingShell banner={<LandingMaintenanceNotice setting={maintenance} timeZone={timeZone} />}>
      <Hero
        headline={`${t("task", "other")}, files and deadlines for your nonprofit, in one place.`}
        subheading="Built for youth and community organizations, so your team spends less time chasing updates and more time on your programs."
        imageAlt="The Groundwork dashboard: reminders about overdue work, counts of overdue and upcoming items, and a personal to-do list."
      />
      <Problems t={t} />
      <Benefits t={t} />
      <HowItWorks t={t} />
      <FaqSection faqs={faqs} />
      <FinalCta />
    </MarketingShell>
  );
}
