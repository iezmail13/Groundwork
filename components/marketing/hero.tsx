import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { GridPulse } from "@/components/ui/grid-pulse";

/** A halo in the page colour, so lit cells never crowd the letters. */
const guard =
  "[text-shadow:0_0_6px_var(--color-canvas),0_0_14px_var(--color-canvas),0_0_30px_var(--color-canvas),0_0_52px_var(--color-canvas)]";

/** The landing page's opening: headline, actions and a real screenshot. */
export function Hero({ subheading, imageAlt }: { subheading: string; imageAlt: string }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-rule bg-canvas">
      <GridPulse />
      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-20">
        <Badge variant="quiet" className="bg-canvas px-3 py-1 text-sm">
          Built for youth and community organizations
        </Badge>
        <h1
          id="hero-title"
          data-grid-avoid
          className={`mx-auto mt-6 max-w-3xl font-heading text-4xl leading-tight font-bold text-balance sm:text-5xl lg:text-6xl ${guard}`}
        >
          Run your organization on solid ground.
        </h1>
        <p data-grid-avoid className={`mx-auto mt-6 max-w-2xl text-lg text-pretty text-ink-muted ${guard}`}>
          {subheading}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/login" data-grid-avoid className="h-12 w-full px-6 text-base sm:w-auto">
            Get started
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
          <ButtonLink href="#features" variant="secondary" data-grid-avoid className="h-12 w-full px-6 text-base sm:w-auto">
            See what&apos;s inside
          </ButtonLink>
        </div>
        <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-xl border border-rule bg-panel p-1.5 sm:p-2">
          <Image
            src="/marketing/dashboard.png"
            alt={imageAlt}
            width={1280}
            height={800}
            priority
            sizes="(min-width: 1024px) 1008px, 100vw"
            className="h-auto w-full rounded-lg border border-rule"
          />
        </div>
      </div>
    </section>
  );
}
