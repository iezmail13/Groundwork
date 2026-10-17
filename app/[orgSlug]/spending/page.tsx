import Link from "next/link";
import type { Metadata } from "next";
import { CircleCheck, Clock, ExternalLink, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DecisionButtons, ReceiptButton, SpendingForm, WithdrawButton } from "@/components/spending/spending-form";
import { BudgetBars } from "@/components/spending/budget-bars";
import { getOrgContext, getMembers } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getBudgets, getSpending, SPENDING_CATEGORIES, type SpendingEntry, type SpendingStatus } from "@/lib/spending";
import { canManageOrg, rankOf } from "@/lib/roles";
import { formatMoney } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { inputClass } from "@/components/ui/field";

export const metadata: Metadata = { title: "Spending" };

const STATUS: Record<SpendingStatus, { label: string; icon: typeof Clock; cls: string }> = {
  pending: { label: "Waiting", icon: Clock, cls: "border-warn text-warn-ink" },
  approved: { label: "Approved", icon: CircleCheck, cls: "border-good bg-good text-canvas" },
  rejected: { label: "Rejected", icon: XCircle, cls: "border-bad text-bad-ink" },
};

function StatusBadge({ status }: { status: SpendingStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      <Icon aria-hidden className="size-3.5" />
      {s.label}
    </span>
  );
}

/**
 * Finance (D108). Everyone on a program submits spending for it and sees only
 * their own. Owners and managers also see budgets against actual, every
 * entry, and approve or reject what's waiting.
 */
export default async function SpendingPage({ params, searchParams }: PageProps<"/[orgSlug]/spending">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(orgSlug);
  const { t, org, base, today } = ctx;
  const manager = canManageOrg(ctx.role);
  const supabase = await createClient();
  const statusFilter = (["pending", "approved", "rejected"] as const).find((s) => s === sp.status);
  const fundFilter = typeof sp.fund === "string" && /^[0-9a-f-]{36}$/.test(sp.fund) ? sp.fund : undefined;

  const [{ data: myPrograms }, entries, budgets, members, { data: orgRow }] = await Promise.all([
    supabase.rpc("my_projects_with_funds", { org: org.id }),
    getSpending(ctx, { status: statusFilter, fundId: fundFilter }),
    manager ? getBudgets(ctx) : Promise.resolve([]),
    getMembers(org.id),
    supabase.from("organizations").select("accounting_name, accounting_url").eq("id", org.id).maybeSingle(),
  ]);
  const nameOf = new Map(members.map((m) => [m.userId, m.name]));
  const rankOfUser = new Map(members.map((m) => [m.userId, rankOf(m.role)]));
  const myRank = rankOf(ctx.role);
  const canDecide = (e: SpendingEntry) =>
    manager &&
    e.status === "pending" &&
    e.submittedBy !== ctx.userId &&
    (myRank > (rankOfUser.get(e.submittedBy ?? "") ?? 0) || (myRank === 4 && rankOfUser.get(e.submittedBy ?? "") === 4));
  const waiting = entries.filter(canDecide);
  const label = (e: SpendingEntry) => `${e.category}, ${formatMoney(e.amountCents, e.currency)} on ${e.spentOn}`;
  const program = t("project");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Spending"
        description={
          manager
            ? "Your official books stay in your accounting software. This page tracks budgets and grant spending."
            : `Submit what you spent for a ${program.toLowerCase()}. Owners and managers approve it.`
        }
        actions={
          manager && orgRow?.accounting_url ? (
            <a
              href={orgRow.accounting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel"
            >
              Open {orgRow.accounting_name && orgRow.accounting_name !== "Other" ? orgRow.accounting_name : "your accounting software"}
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : undefined
        }
      />

      {manager ? (
        <section aria-labelledby="budgets" className="flex flex-col gap-3">
          <h2 id="budgets" className="font-heading text-xl font-bold">
            Budget against actual
          </h2>
          {budgets.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No funds yet.{" "}
              <Link href={`${base}/funds`} className="text-accent underline underline-offset-4">
                Add one
              </Link>{" "}
              to track spending against it.
            </p>
          ) : (
            <BudgetBars budgets={budgets} base={base} caption="Approved spending against each fund's total" />
          )}
        </section>
      ) : null}

      <section aria-labelledby="submit" className="flex max-w-3xl flex-col gap-3">
        <h2 id="submit" className="font-heading text-xl font-bold">
          Submit spending
        </h2>
        <SpendingForm
          orgSlug={org.slug}
          programs={(myPrograms ?? []).map((p) => ({ id: p.id, name: p.name }))}
          categories={SPENDING_CATEGORIES}
          today={today}
          programLabel={program}
        />
      </section>

      {manager && waiting.length > 0 ? (
        <section aria-labelledby="to-decide" className="flex flex-col gap-3">
          <h2 id="to-decide" className="font-heading text-xl font-bold">
            Waiting for you <span className="font-normal text-ink-muted">({waiting.length})</span>
          </h2>
          <EntryTable entries={waiting} nameOf={nameOf} me={ctx.userId} label={label} canDecide={canDecide} programLabel={program} caption="Spending waiting for your decision" />
        </section>
      ) : null}

      <section aria-labelledby="entries" className="flex flex-col gap-3">
        <h2 id="entries" className="font-heading text-xl font-bold">
          {manager ? "All spending" : "Your spending"}
        </h2>
        {manager ? (
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Fund
              <select name="fund" defaultValue={fundFilter ?? ""} className={inputClass}>
                <option value="">All funds</option>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Status
              <select name="status" defaultValue={statusFilter ?? ""} className={inputClass}>
                <option value="">Any</option>
                <option value="pending">Waiting</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <button type="submit" className="rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel">
              Show
            </button>
          </form>
        ) : null}
        {entries.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing here yet.</p>
        ) : (
          <EntryTable entries={entries} nameOf={nameOf} me={ctx.userId} label={label} canDecide={canDecide} programLabel={program} caption={manager ? "All spending, newest first" : "Your spending, newest first"} />
        )}
      </section>

      {manager && budgets.length > 0 ? (
        <section aria-labelledby="export" className="flex flex-col gap-3">
          <h2 id="export" className="font-heading text-xl font-bold">
            Export approved spending
          </h2>
          <form action={`${base}/spending/export`} method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Fund
              <select name="fund" className={inputClass} defaultValue={budgets[0]!.id}>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              From
              <input type="date" name="from" defaultValue={addDays(today, -89)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              To
              <input type="date" name="to" defaultValue={today} className={inputClass} />
            </label>
            <button type="submit" className="rounded-md bg-accent px-4 py-2 font-heading text-sm font-semibold text-on-accent">
              Download CSV
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function EntryTable({
  entries,
  nameOf,
  me,
  label,
  canDecide,
  programLabel,
  caption,
}: {
  entries: SpendingEntry[];
  nameOf: Map<string, string>;
  me: string;
  label: (e: SpendingEntry) => string;
  canDecide: (e: SpendingEntry) => boolean;
  programLabel: string;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink font-heading">
            <th scope="col" className="py-2 pr-3">Date</th>
            <th scope="col" className="py-2 pr-3">What</th>
            <th scope="col" className="py-2 pr-3">{programLabel} · Fund</th>
            <th scope="col" className="py-2 pr-3">Submitted by</th>
            <th scope="col" className="py-2 pr-3 text-right">Amount</th>
            <th scope="col" className="py-2 pr-3">Status</th>
            <th scope="col" className="py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-rule align-top" data-entry={e.category}>
              <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{e.spentOn}</td>
              <td className="py-2.5 pr-3">
                <span className="font-semibold">{e.category}</span>
                {e.note ? <span className="block text-ink-muted">{e.note}</span> : null}
              </td>
              <td className="py-2.5 pr-3">
                {e.projectName ?? ""}
                <span className="block text-ink-muted">{e.fundName ?? "A fund"}</span>
              </td>
              <td className="py-2.5 pr-3">{e.submittedBy === me ? "You" : (nameOf.get(e.submittedBy ?? "") ?? "Someone who left")}</td>
              <td className="py-2.5 pr-3 text-right font-heading font-bold tabular-nums">{formatMoney(e.amountCents, e.currency)}</td>
              <td className="py-2.5 pr-3">
                <StatusBadge status={e.status} />
                {e.status !== "pending" ? (
                  <span className="mt-1 block text-xs text-ink-muted">
                    by {e.decidedBy === me ? "you" : (nameOf.get(e.decidedBy ?? "") ?? "someone who left")}
                    {e.decisionNote ? `: ${e.decisionNote}` : ""}
                  </span>
                ) : null}
              </td>
              <td className="py-2.5">
                <div className="flex flex-col items-start gap-1.5">
                  {e.hasReceipt ? <ReceiptButton entryId={e.id} label={label(e)} /> : null}
                  {canDecide(e) ? <DecisionButtons entryId={e.id} label={label(e)} /> : null}
                  {e.submittedBy === me && e.status === "pending" ? <WithdrawButton entryId={e.id} label={label(e)} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
