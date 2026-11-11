import { createTranslator, lower } from "@/lib/terminology/t";
import { NONPROFIT_LABELS } from "@/lib/terminology/defaults";
import type { MaintenanceSetting } from "@/lib/maintenance";
import { LandingMaintenanceNotice } from "@/components/maintenance/notices";
import { Hero } from "./hero";
import { MarketingShell } from "./shell";
import { FinalCta, HowItWorks, Problems } from "./sections";
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
        width: 1632,
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
        width: 1632,
        height: 1280,
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
        width: 1632,
        height: 1280,
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
        width: 1632,
        height: 1280,
      },
    },
  ];

  return (
    <MarketingShell landing banner={<LandingMaintenanceNotice setting={maintenance} timeZone={timeZone} />}>
      <Hero imageAlt="The Groundwork dashboard: reminders about overdue work, counts of overdue and upcoming items, and a personal to-do list." />
      <section id="features" aria-labelledby="features-title" className="scroll-mt-4 border-b border-rule bg-panel px-4 py-20 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
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
      <FinalCta />
    </MarketingShell>
  );
}
