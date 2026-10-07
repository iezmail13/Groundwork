import Link from "next/link";
import type { ReactNode } from "react";

export type Tab = { label: string; href: string; active: boolean };

export function PageHeader({
  title,
  description,
  actions,
  tabs,
  tabsLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Only pass tabs when the section has more than one view. */
  tabs?: Tab[];
  tabsLabel?: string;
}) {
  return (
    <header className="border-b border-rule">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs && tabs.length > 1 ? (
        <nav aria-label={tabsLabel ?? "Views"} className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`border-b-2 px-3 py-2 font-heading text-sm font-semibold whitespace-nowrap transition-colors ${
                tab.active ? "border-ink text-ink" : "border-transparent text-ink-muted hover:border-rule hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
