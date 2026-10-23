import Link from "next/link";
import { CircleCheck, Clock, OctagonAlert, TriangleAlert } from "lucide-react";
import { BUDGET_LABEL, BUDGET_TONE, type BudgetStatus } from "@/lib/budget";
import { formatMoney, formatShare } from "@/lib/money";
import type { FundBudget } from "@/lib/spending";

const ICON: Record<BudgetStatus, typeof CircleCheck> = {
  on_pace: CircleCheck,
  near_limit: TriangleAlert,
  deadline_soon: Clock,
  over: OctagonAlert,
  at_risk: OctagonAlert,
};

/** The status, as an icon and a word as well as a colour (D83). */
export function BudgetBadge({ status }: { status: BudgetStatus }) {
  const Icon = ICON[status];
  const tone = BUDGET_TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        tone === "good" ? "border-good text-good-ink" : tone === "warn" ? "border-warn text-warn-ink" : "border-bad bg-bad text-canvas"
      }`}
      data-budget={status}
    >
      <Icon aria-hidden className="size-3.5" />
      {BUDGET_LABEL[status]}
    </span>
  );
}

/**
 * Budget against actual (D108): one bar per fund, approved spending filled in
 * its status colour and waiting spending hatched after it. Each fund links to
 * its page, where the spending is listed.
 */
export function BudgetBars({ budgets, base, caption }: { budgets: FundBudget[]; base: string; caption: string }) {
  return (
    <figure className="flex flex-col gap-4">
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="flex flex-col gap-4">
        {budgets.map((b) => {
          const tone = BUDGET_TONE[b.status];
          const spent = b.totalCents > 0 ? Math.min(100, (b.spentCents / b.totalCents) * 100) : b.spentCents > 0 ? 100 : 0;
          const waiting = b.totalCents > 0 ? Math.min(100 - spent, (b.pendingCents / b.totalCents) * 100) : 0;
          return (
            <li key={b.id} className="flex flex-col gap-1.5" data-fund={b.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link
                  href={`${base}/funds/${b.id}`}
                  className="font-semibold hover:underline"
                  aria-label={`${b.name}: ${formatMoney(b.spentCents, b.currency)} spent of ${formatMoney(b.totalCents, b.currency)}, ${BUDGET_LABEL[b.status]}, open the fund`}
                >
                  {b.name}
                </Link>
                <BudgetBadge status={b.status} />
              </div>
              <span aria-hidden className="relative flex h-3 overflow-hidden rounded-sm border border-rule bg-panel">
                <span
                  className="h-full transition-all duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${spent}%`, background: `var(--${tone})` }}
                />
                {waiting > 0 ? (
                  <span
                    className="h-full"
                    style={{
                      width: `${waiting}%`,
                      background: `repeating-linear-gradient(135deg, var(--${tone}) 0 2px, transparent 2px 6px)`,
                    }}
                  />
                ) : null}
              </span>
              <p className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
                <span>
                  <span className="font-heading font-bold text-ink tabular-nums">{formatMoney(b.spentCents, b.currency)}</span> spent of{" "}
                  {formatMoney(b.totalCents, b.currency)} ({formatShare(b.spentCents, b.totalCents)})
                </span>
                {b.pendingCents > 0 ? <span>{formatMoney(b.pendingCents, b.currency)} waiting for approval</span> : null}
                {b.spendBy ? <span>Spend by {b.spendBy}</span> : null}
              </p>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
