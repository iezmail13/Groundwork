import Link from "next/link";
import { LogoBadge } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { MobileMenu } from "./mobile-menu";

/** The public pages' links, in the order the masthead shows them. */
export const SITE_LINKS = [
  { href: "/#benefits", label: "Features" },
  { href: "/security", label: "Security" },
] as const;

/** Top bar of the public pages. */
export function Masthead() {
  return (
    <header className="relative border-b border-rule bg-canvas">
      <nav aria-label="Site" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="logo-link inline-flex items-center gap-2.5 rounded-md" aria-label="Groundwork home">
          <LogoBadge size={36} />
          <span className="hidden font-heading text-lg font-bold sm:inline">Groundwork</span>
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="font-heading text-sm font-semibold text-ink-muted hover:text-ink">
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="font-heading text-sm font-semibold text-ink-muted hover:text-ink">
            Log in
          </Link>
          <ButtonLink href="/signup">Start free</ButtonLink>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ButtonLink href="/signup" size="sm">
            Start free
          </ButtonLink>
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}
