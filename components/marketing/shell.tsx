import type { ReactNode } from "react";
import { MarketingFooter } from "./footer";
import { Masthead } from "./masthead";

/** The frame every public page shares: skip link, masthead, content, footer. */
export function MarketingShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable absolute top-2 left-2 z-30 rounded-md bg-primary px-3 py-2 text-on-primary">
        Skip to content
      </a>
      {banner}
      <Masthead />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}

/** A plain-language page (Security, Privacy, Terms): a header and readable prose. */
export function ProsePage({ title, lead, updated, children }: { title: string; lead: string; updated?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <header className="border-b border-rule pb-6">
        <h1 className="font-heading text-4xl font-bold text-balance">{title}</h1>
        <p className="mt-4 text-lg text-ink-muted">{lead}</p>
        {updated ? <p className="mt-3 text-sm text-ink-muted">Last updated {updated}</p> : null}
      </header>
      <div className="prose-page mt-8 flex flex-col gap-8">{children}</div>
    </article>
  );
}

export function ProseSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-heading text-2xl font-bold">
        {title}
      </h2>
      <div className="flex flex-col gap-3 leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">{children}</div>
    </section>
  );
}
