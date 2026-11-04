import Link from "next/link";
import { createTranslator, lower } from "@/lib/terminology/t";
import { NONPROFIT_LABELS } from "@/lib/terminology/defaults";
import { CONTACT_EMAIL, type MaintenanceSetting } from "@/lib/maintenance";
import { MAX_UPLOAD_BYTES } from "@/lib/validation";
import { LandingMaintenanceNotice } from "@/components/maintenance/notices";
import { Hero } from "./hero";
import { MarketingShell } from "./shell";
import { FaqSection, FinalCta, HowItWorks, Problems, type Faq } from "./sections";
import { FeatureScroll, type Feature } from "./feature-scroll";

/** The public page signed-out visitors see at /. */
export function Landing({ maintenance, timeZone }: { maintenance: MaintenanceSetting; timeZone: string }) {
  // no organization here, so the built-in default labels, and the nonprofit
  // preset's word for a project where the copy names both
  const t = createTranslator();
  const np = createTranslator(NONPROFIT_LABELS);
  const features: Feature[] = [
    {
      id: "feature-programs",
      heading: `${np("project", "other")} and ${lower(t("project", "other"))}`,
      sentence: `Give each ${lower(np("project"))} its own space, with its people, work, files and dates kept together.`,
      bullets: [
        `Only the people on a ${lower(np("project"))} can see what's in it`,
        `${t("project_role.lead", "other")}, progress and dates at a glance`,
        `Archive a ${lower(np("project"))} when it ends and keep its history`,
      ],
      image: {
        name: "feature-programs",
        alt: `A list of three ${lower(np("project", "other"))}, Summer Day Camp, After-School Tutoring and Community Food Drive, each with its ${lower(t("project_role.lead", "other"))}, a progress bar, its dates and an Active badge.`,
        width: 2312,
        height: 816,
      },
    },
    {
      id: "feature-board",
      heading: `${t("task", "other")} and board`,
      sentence: `Break the work into ${lower(t("task", "other"))}, give each one an owner and a due date, and move it across a board.`,
      bullets: [
        "Overdue and due-soon work is flagged in words, not just colour",
        "Set priorities, and let people claim open work",
        "Tick work done from the board, the list or your dashboard",
      ],
      image: {
        name: "feature-board",
        alt: "A board of work in two columns, with cards showing who has each one, its priority, its due date and Overdue or Tomorrow badges.",
        width: 2312,
        height: 1400,
      },
    },
    {
      id: "feature-calendar",
      heading: "Calendar and reminders",
      sentence: `${t("event", "other")} and due dates share one calendar, and Groundwork reminds people before work is due.`,
      bullets: [
        `Repeating ${lower(t("event", "other"))}: pick the weekdays and how many weeks`,
        "In-app reminders for work due tomorrow or overdue",
        "A private calendar feed for Google, Apple or Outlook",
      ],
      image: {
        name: "feature-calendar",
        alt: "A month calendar with a busy current week: day camp every morning, tutoring in the afternoons, a lunch check-in and a sorting day, with due work on its days.",
        width: 2312,
        height: 1200,
      },
    },
    {
      id: "feature-documents",
      heading: t("document", "other"),
      sentence: "Keep permission forms, budgets and handbooks in one private, searchable place.",
      bullets: [
        "Tag, pin and search your team's files",
        `Keep a file with its ${lower(np("project"))}, or share it with everyone`,
        "Files open through secure links that expire after a minute",
      ],
      image: {
        name: "feature-documents",
        alt: "A list of files: a volunteer handbook, a budget and permission forms, each with its tags, who added it and when.",
        width: 2312,
        height: 1248,
      },
    },
  ];
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
            there are no passwords to steal. <Link href="/security" className="font-semibold text-accent underline underline-offset-4">More about security</Link>.
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
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-accent underline underline-offset-4">
            {CONTACT_EMAIL}
          </a>{" "}
          and we&apos;ll talk it through.
        </p>
      ),
    },
  ];

  return (
    <MarketingShell landing banner={<LandingMaintenanceNotice setting={maintenance} timeZone={timeZone} />}>
      <Hero imageAlt="The Groundwork dashboard: reminders about overdue work, counts of overdue and upcoming items, and a personal to-do list." />
      <section id="features" aria-labelledby="features-title" className="scroll-mt-4 border-b border-rule bg-panel px-4 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 id="features-title" className="max-w-2xl font-heading text-3xl font-bold text-balance md:text-4xl">
            Everything your {lower(np("project", "other"))} run on, in one place
          </h2>
          <div className="mt-6 lg:mt-0">
            <FeatureScroll features={features} />
          </div>
        </div>
      </section>
      <Problems t={t} />
      <HowItWorks t={t} />
      <FaqSection faqs={faqs} />
      <FinalCta />
    </MarketingShell>
  );
}
