import { Badge } from "@/components/ui/badge";
import { lower, type Translate } from "@/lib/terminology/t";
import { FeatureTabs, type FeatureTab } from "./feature-tabs";

/** What the app does today, one tab per area, each with a real screenshot. */
export function Features({ t }: { t: Translate }) {
  const tabs: FeatureTab[] = [
    {
      id: "plan",
      icon: "FolderKanban",
      label: "Plan the work",
      badge: `${t("project", "other")} and ${lower(t("task", "other"))}`,
      title: "See who's doing what, and what's next.",
      description: `Break each ${lower(t("project"))} into ${lower(t("task", "other"))}, assign them, set due dates, and move them across a board, or sort and filter them in a list. Overdue work is called out in words, not just colour.`,
      image: {
        src: "/marketing/tasks-board.png",
        alt: "A board with three columns of work, each card showing who it's assigned to, its due date, and an Overdue badge where it's late.",
        width: 1280,
        height: 800,
      },
    },
    {
      id: "dates",
      icon: "CalendarDays",
      label: "Never miss a date",
      badge: `${t("section.calendar")} and reminders`,
      title: "Every deadline in one calendar.",
      description: `Put ${lower(t("event", "other"))} and due dates on one shared calendar. Overdue and due-soon work is flagged on every page and in a reminders strip on your dashboard.`,
      image: {
        src: "/marketing/calendar.png",
        alt: "A month calendar with today highlighted and the month's activities and due dates on their days.",
        width: 1280,
        height: 800,
      },
    },
    {
      id: "files",
      icon: "FileText",
      label: "Keep files together",
      badge: t("document", "other"),
      title: "Find the right file the first time.",
      description:
        "Upload, tag and search your team's files. Files stay private to your organization and open through short-lived secure links.",
      image: {
        src: "/marketing/documents.png",
        alt: "A table of the organization's files with their tags, sizes and upload dates, and a search box above it.",
        width: 1280,
        height: 800,
      },
    },
    {
      id: "dashboard",
      icon: "LayoutDashboard",
      label: "Start every day informed",
      badge: t("section.dashboard"),
      title: "Your whole organization at a glance.",
      description: `A dashboard you can arrange to show what's due, what's overdue and how each ${lower(t("project"))} is moving.`,
      image: {
        src: "/marketing/dashboard-widgets.png",
        alt: "Dashboard panels counting overdue work and work due in the next seven days, with a personal to-do list and upcoming dates.",
        width: 956,
        height: 840,
      },
    },
  ];

  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <Badge variant="quiet" className="px-3 py-1 text-sm">
          What&apos;s inside
        </Badge>
        <h2 id="features-title" className="font-heading text-3xl font-bold text-balance md:text-4xl">
          Everything your team needs, nothing it doesn&apos;t
        </h2>
        <p className="text-lg text-ink-muted">
          One dashboard for the work, the dates and the files, so your team spends less time chasing updates.
        </p>
      </div>
      <FeatureTabs tabs={tabs} />
    </section>
  );
}
