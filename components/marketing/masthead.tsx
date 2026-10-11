import Link from "next/link";
import { LogoBadge } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { MobileMenu } from "./mobile-menu";

/** Top bar of the public landing page. */
export function Masthead() {
  return (
    <header className="relative border-b border-rule bg-canvas">
      <nav aria-label="Site" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="logo-link inline-flex items-center gap-2.5 rounded-md" aria-label="Groundwork home">
          <LogoBadge size={36} />
          <span className="hidden font-heading text-lg font-bold sm:inline">Groundwork</span>
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          <a href="#features" className="font-heading text-sm font-semibold text-ink-muted hover:text-ink">
            Features
          </a>
          <Link href="/login" className="font-heading text-sm font-semibold text-ink-muted hover:text-ink">
            Log in
          </Link>
          <ButtonLink href="/login">Get started</ButtonLink>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ButtonLink href="/login" size="sm">
            Get started
          </ButtonLink>
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}
