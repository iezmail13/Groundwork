import Image from "next/image";
import { ArrowRight, CalendarClock, FileSearch, MessageSquareMore, UserRoundPlus, UsersRound, FolderPlus, Rocket } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { lower, type Translate } from "@/lib/terminology/t";

/** "Sound familiar?": the everyday problems Groundwork is built to fix. */
export function Problems({ t }: { t: Translate }) {
  const items = [
    {
      icon: MessageSquareMore,
      title: "Chasing updates",
      body: `You spend Monday morning messaging people to find out where things stand. In Groundwork every ${lower(t("task"))} shows who has it, when it's due and whether it's late.`,
    },
    {
      icon: FileSearch,
      title: "Lost files",
      body: "The consent form is in someone's inbox, the budget is on someone else's laptop. Groundwork keeps your files in one private, searchable place.",
    },
    {
      icon: CalendarClock,
      title: "Missed funder deadlines",
      body: "Reporting dates slip past while everyone is busy with the day-to-day. Due dates sit on one shared calendar, and overdue work is flagged on every page.",
    },
    {
      icon: UsersRound,
      title: "People come and go",
      body: `When someone leaves, their work shouldn't leave with them. Their open ${lower(t("task", "other"))} are handed to someone else, and the history stays.`,
    },
  ];
  return (
    <section aria-labelledby="problems-title" className="border-b border-rule px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 id="problems-title" className="text-center font-heading text-3xl font-bold md:text-4xl">
          Sound familiar?
        </h2>
        <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.title} className="flex gap-4 border-t border-rule pt-5">
              <item.icon aria-hidden className="mt-1 size-6 shrink-0" />
              <div>
                <h3 className="font-heading text-lg font-bold">{item.title}</h3>
                <p className="mt-1 text-ink-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type Benefit = { title: string; body: string; image: { src: string; alt: string; width: number; height: number } };

/** Three key benefits, each with one real screenshot. Only features that ship. */
export function Benefits({ t }: { t: Translate }) {
  const benefits: Benefit[] = [
    {
      title: "See who's doing what, and what's next",
      body: `Break each ${lower(t("project"))} into ${lower(t("task", "other"))}, give each one an owner and a due date, and follow them on a board or in a list you can sort and filter.`,
      image: {
        src: "/marketing/tasks-board.png",
        alt: "A board of work in three columns, each card showing who it's assigned to, its due date, and an Overdue badge where it's late.",
        width: 1280,
        height: 800,
      },
    },
    {
      title: "Never miss a deadline",
      body: `Due dates and ${lower(t("event", "other"))} share one calendar. Your dashboard opens with what's overdue and what's due this week, in words, not just colour.`,
      image: {
        src: "/marketing/calendar.png",
        alt: "A month calendar with today highlighted and the month's activities and due dates on their days.",
        width: 1280,
        height: 800,
      },
    },
    {
      title: "Find the right file the first time",
      body: "Upload, tag and search your team's files. They stay private to your organization and open through short-lived secure links.",
      image: {
        src: "/marketing/documents.png",
        alt: "A table of the organization's files with their tags, sizes and upload dates, and a search box above it.",
        width: 1280,
        height: 800,
      },
    },
  ];
  return (
    <section id="benefits" aria-labelledby="benefits-title" className="scroll-mt-4 border-b border-rule px-4 py-20 sm:px-6">
      <h2 id="benefits-title" className="sr-only">
        What Groundwork does
      </h2>
      <div className="mx-auto flex max-w-6xl flex-col gap-20">
        {benefits.map((b, i) => (
          <article key={b.title} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
            <div className={i % 2 ? "md:order-2" : ""}>
              <h3 className="font-heading text-2xl font-bold text-balance md:text-3xl">{b.title}</h3>
              <p className="mt-3 text-lg text-ink-muted">{b.body}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-rule bg-panel p-1.5">
              <Image src={b.image.src} alt={b.image.alt} width={b.image.width} height={b.image.height} sizes="(min-width: 768px) 560px, 100vw" className="h-auto w-full rounded-lg border border-rule" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** How it works, in three steps. */
export function HowItWorks({ t }: { t: Translate }) {
  const steps = [
    { icon: Rocket, title: "Sign up", body: "Use your Google account or your email. No password, no credit card." },
    { icon: UserRoundPlus, title: "Add your team", body: `Invite people with a link and choose which ${lower(t("project", "other"))} each person can see.` },
    { icon: FolderPlus, title: `Run your first ${lower(t("project"))}`, body: `Add ${lower(t("task", "other"))}, dates and files, and see it all on your dashboard.` },
  ];
  return (
    <section aria-labelledby="how-title" className="border-b border-rule px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 id="how-title" className="text-center font-heading text-3xl font-bold md:text-4xl">
          How it works
        </h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 border-t-2 border-ink pt-5">
              <span className="flex items-center gap-2 font-heading text-sm font-bold text-ink-muted">
                <s.icon aria-hidden className="size-4" />
                Step {i + 1}
              </span>
              <h3 className="font-heading text-xl font-bold">{s.title}</h3>
              <p className="text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export type Faq = { q: string; a: React.ReactNode };

/** Questions people ask before signing up. Every answer is checked against the code and settings. */
export function FaqSection({ faqs }: { faqs: Faq[] }) {
  return (
    <section aria-labelledby="faq-title" className="border-b border-rule px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h2 id="faq-title" className="text-center font-heading text-3xl font-bold md:text-4xl">
          Questions
        </h2>
        <div className="mt-10 divide-y divide-rule border-y border-rule">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ArrowRight aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
              </summary>
              <div className="mt-3 flex flex-col gap-2 text-ink-muted">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The closing call to action. */
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-4 py-20 text-center sm:px-6">
      <h2 id="cta-title" className="font-heading text-3xl font-bold md:text-4xl">
        Get your team on the same page
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-lg text-ink-muted">Create your organization in a minute, then invite your team.</p>
      <div className="mt-8">
        <ButtonLink href="/signup" className="h-12 px-7 text-base">
          Start free
          <ArrowRight aria-hidden className="size-4" />
        </ButtonLink>
      </div>
    </section>
  );
}
