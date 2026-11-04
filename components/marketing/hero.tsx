import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { DataGridHero } from "@/components/ui/data-grid-hero";

/** A halo in the page colour, so lit cells never crowd the letters. */
const guard =
  "[text-shadow:0_0_6px_var(--color-canvas),0_0_14px_var(--color-canvas),0_0_30px_var(--color-canvas),0_0_52px_var(--color-canvas)]";

const shot = "block h-auto w-full rounded-lg border border-rule";
const frame = "rounded-xl border border-rule bg-panel p-1.5 sm:p-2";

/** One screenshot per colour scheme: the app really has both, so neither is faked. */
function Shot({ name, alt, priority = false, sizes }: { name: string; alt: string; priority?: boolean; sizes: string }) {
  return (
    <>
      <span className="only-light">
        <Image src={`/marketing/${name}.png`} alt={alt} width={1280} height={800} priority={priority} sizes={sizes} className={shot} />
      </span>
      <span className="only-dark">
        <Image src={`/marketing/${name}-dark.png`} alt={alt} width={1280} height={800} priority={priority} sizes={sizes} className={shot} />
      </span>
    </>
  );
}

/**
 * The landing page's opening (D117): the data grid behind a centred headline,
 * the two ways in, and the dashboard with the board and calendar fanned
 * behind it, overlapping the bottom of the hero.
 */
export function Hero({ imageAlt }: { imageAlt: string }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-rule bg-canvas">
      {/* the band the preview overlaps into */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[22%] border-t border-rule bg-panel sm:h-[30%]" />
      {/* The grid fades behind the words (so they keep their contrast) and
          towards the preview, which sits on the plain page. */}
      <DataGridHero gridClassName="[mask-composite:intersect] [mask-image:radial-gradient(ellipse_44%_32%_at_50%_26%,rgb(0_0_0/0.12)_55%,#000_100%),linear-gradient(to_bottom,#000_30%,transparent_66%)] max-sm:[mask-image:radial-gradient(ellipse_70%_36%_at_50%_24%,rgb(0_0_0/0.12)_60%,#000_100%),linear-gradient(to_bottom,#000_30%,transparent_60%)]">
        <div className="mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
          <h1
            id="hero-title"
            className={`mx-auto max-w-4xl font-heading text-4xl leading-[1.08] font-bold text-balance sm:text-6xl lg:text-7xl ${guard}`}
          >
            <span className="sm:block">Manage your work</span> <span className="sm:block">from the ground up</span>
          </h1>
          <p className={`mx-auto mt-6 max-w-2xl text-lg text-pretty text-ink-muted sm:text-xl ${guard}`}>
            The operating system for nonprofits and community organizations.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink
              href="/demo"
              className="h-12 w-full px-7 text-base hover:border-[var(--landing-accent-hover)] hover:bg-[var(--landing-accent-hover)] sm:w-auto"
            >
              Try the demo
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink href="/signup" variant="secondary" className="h-12 w-full border-ink/40 px-7 text-base sm:w-auto">
              Start free
            </ButtonLink>
          </div>
          <p className={`mt-4 text-sm text-ink-muted ${guard}`}>No credit card needed.</p>

          <div className="relative mx-auto mt-14 max-w-5xl pb-10 sm:mt-16 sm:pb-16">
            {/* the board and the calendar, fanned behind the dashboard */}
            <div aria-hidden className={`absolute top-0 left-0 hidden w-[46%] origin-bottom-right -translate-x-[6%] -rotate-[5deg] md:block ${frame}`}>
              <Shot name="tasks-board" alt="" sizes="460px" />
            </div>
            <div aria-hidden className={`absolute top-0 right-0 hidden w-[46%] origin-bottom-left translate-x-[6%] rotate-[5deg] md:block ${frame}`}>
              <Shot name="calendar" alt="" sizes="460px" />
            </div>
            <div className={`relative z-10 mx-auto w-full md:mt-12 md:w-[86%] ${frame}`}>
              <Shot name="dashboard" alt={imageAlt} priority sizes="(min-width: 1024px) 860px, 100vw" />
            </div>
          </div>
        </div>
      </DataGridHero>
    </section>
  );
}
