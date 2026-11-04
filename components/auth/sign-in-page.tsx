import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketingShell } from "@/components/marketing/shell";
import { DataGridHero } from "@/components/ui/data-grid-hero";
import { SignInPanel, type SignInMode } from "./sign-in-panel";

/**
 * /login and /signup opened directly (a bookmark, a refresh, an emailed link):
 * the landing page's header, colours and grid, with the shared sign-in panel
 * and a way back to the home page (D117).
 */
export function SignInPage({ mode, next, error }: { mode: SignInMode; next?: string; error?: string }) {
  return (
    <MarketingShell landing>
      <DataGridHero
        mouseGlow={false}
        className="border-b border-rule"
        gridClassName="[mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,rgb(0_0_0/0.1)_45%,#000_100%)]"
      >
        <div className="mx-auto max-w-6xl px-4 pt-5 pb-16 sm:px-6 sm:pb-24">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md py-1 pr-2 font-heading text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Link>
          <div className="mx-auto mt-8 w-full max-w-md rounded-xl border border-rule bg-canvas px-5 pt-7 pb-8 sm:mt-12 sm:px-8 sm:pt-9 sm:pb-10">
            <SignInPanel mode={mode} next={next} error={error} titleId="signin-title" />
          </div>
        </div>
      </DataGridHero>
    </MarketingShell>
  );
}
