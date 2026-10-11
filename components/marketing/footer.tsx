const CONTACT = "groundworkceo@gmail.com";

export function MarketingFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="font-heading font-bold text-ink">Groundwork</span>
        <a href={`mailto:${CONTACT}`} className="underline underline-offset-4 hover:text-ink">
          {CONTACT}
        </a>
        <span>© {new Date().getFullYear()} Groundwork</span>
      </div>
    </footer>
  );
}
