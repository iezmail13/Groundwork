/** Loading placeholders. They pulse gently (static under reduced motion). */
export function TableSkeleton({ rows = 6, withTabs = true }: { rows?: number; withTabs?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="border-b border-rule pb-4">
        <div className="skeleton h-9 w-56" />
        {withTabs ? <div className="skeleton mt-6 h-5 w-40" /> : null}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-rule py-4">
            <div className="skeleton h-4 flex-[3]" />
            <div className="skeleton h-4 flex-1" />
            <div className="skeleton h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GridSkeleton({ cells = 6 }: { cells?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading…</span>
      <div className="border-b border-rule pb-4">
        <div className="skeleton h-9 w-56" />
      </div>
      <div className="grid gap-4 md:grid-cols-12">
        {Array.from({ length: cells }, (_, i) => (
          <div key={i} className="skeleton h-48 md:col-span-6 xl:col-span-4" />
        ))}
      </div>
    </div>
  );
}
