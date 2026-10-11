import { createTranslator, lower } from "@/lib/terminology/t";
import { Features } from "./features";
import { MarketingFooter } from "./footer";
import { Hero } from "./hero";
import { Masthead } from "./masthead";

/** The public page signed-out visitors see at /. */
export function Landing() {
  // no organization here, so the built-in default labels
  const t = createTranslator();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable absolute top-2 left-2 z-30 rounded-md bg-primary px-3 py-2 text-on-primary">
        Skip to content
      </a>
      <Masthead />
      <main id="main" className="flex-1">
        <Hero
          subheading={`Groundwork keeps your team's ${lower(t("project", "other"))}, ${lower(t("task", "other"))}, files and calendar in one place, so nothing slips through the cracks between busy weeks, staff changes and funder deadlines.`}
          imageAlt="The Groundwork dashboard: reminders about overdue work, counts of overdue and upcoming items, a quick-add box, a personal to-do list and upcoming dates."
        />
        <Features t={t} />
      </main>
      <MarketingFooter />
    </div>
  );
}
