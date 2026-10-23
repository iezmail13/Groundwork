import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/maintenance";

const LINKS = [
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="font-heading font-bold text-ink">Groundwork</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="underline-offset-4 hover:text-ink hover:underline">
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-ink">
            {CONTACT_EMAIL}
          </a>
        </nav>
        <span>© {new Date().getFullYear()} Groundwork</span>
      </div>
    </footer>
  );
}
