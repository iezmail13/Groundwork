import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrgContext } from "@/lib/org";
import { budgetStatus, type BudgetStatus } from "@/lib/budget";

// Finance (D108). RLS decides every row: owners and managers see all
// spending; everyone else sees only their own.

export type SpendingStatus = "pending" | "approved" | "rejected";

export type SpendingEntry = {
  id: string;
  fundId: string;
  fundName: string | null;
  currency: string;
  projectId: string;
  projectName: string | null;
  amountCents: number;
  category: string;
  spentOn: string;
  note: string | null;
  hasReceipt: boolean;
  submittedBy: string | null;
  status: SpendingStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

export const SPENDING_CATEGORIES = ["Supplies", "Food", "Transport", "Venue", "Printing", "Equipment", "Honoraria", "Other"];

export async function getSpending(
  ctx: OrgContext,
  opts: { fundId?: string; status?: SpendingStatus; from?: string; to?: string; limit?: number } = {},
): Promise<SpendingEntry[]> {
  const supabase = await createClient();
  let q = supabase
    .from("spending_entries")
    .select(
      "id, fund_id, project_id, amount_cents, category, spent_on, note, receipt_path, submitted_by, status, decided_by, decided_at, decision_note, project:projects(name)",
    )
    .eq("organization_id", ctx.org.id)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.fundId) q = q.eq("fund_id", opts.fundId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.from) q = q.gte("spent_on", opts.from);
  if (opts.to) q = q.lte("spent_on", opts.to);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  // fund names: managers read the funds; everyone else reads the names they may spend against
  const fundIds = [...new Set(rows.map((r) => r.fund_id))];
  const { data: funds } = fundIds.length
    ? await supabase.from("funds").select("id, name, currency").in("id", fundIds)
    : { data: [] as { id: string; name: string; currency: string }[] };
  const fundOf = new Map((funds ?? []).map((f) => [f.id, f]));
  if (fundOf.size < fundIds.length) {
    const projects = [...new Set(rows.map((r) => r.project_id))];
    for (const p of projects) {
      const { data: names } = await supabase.rpc("spendable_funds", { project: p });
      for (const f of names ?? []) if (!fundOf.has(f.id)) fundOf.set(f.id, { id: f.id, name: f.name, currency: f.currency });
    }
  }
  return rows.map((r) => ({
    id: r.id,
    fundId: r.fund_id,
    fundName: fundOf.get(r.fund_id)?.name ?? null,
    currency: fundOf.get(r.fund_id)?.currency ?? "CAD",
    projectId: r.project_id,
    projectName: r.project?.name ?? null,
    amountCents: r.amount_cents,
    category: r.category,
    spentOn: r.spent_on,
    note: r.note,
    hasReceipt: Boolean(r.receipt_path),
    submittedBy: r.submitted_by,
    status: r.status,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  }));
}

export type FundBudget = {
  id: string;
  name: string;
  currency: string;
  totalCents: number;
  spentCents: number;
  pendingCents: number;
  spendBy: string | null;
  status: BudgetStatus;
};

/** Budget against actual for every fund: owners and managers only (RLS on funds and fund_spending). */
export async function getBudgets(ctx: OrgContext): Promise<FundBudget[]> {
  const supabase = await createClient();
  const [{ data: funds }, { data: spending }] = await Promise.all([
    supabase.from("funds").select("id, name, currency, total_cents, spend_by").eq("organization_id", ctx.org.id).order("name"),
    supabase.rpc("fund_spending", { org: ctx.org.id }),
  ]);
  const byFund = new Map((spending ?? []).map((s) => [s.fund_id, s]));
  return (funds ?? []).map((f) => {
    const s = byFund.get(f.id);
    const spentCents = Number(s?.approved_cents ?? 0);
    return {
      id: f.id,
      name: f.name,
      currency: f.currency,
      totalCents: f.total_cents,
      spentCents,
      pendingCents: Number(s?.pending_cents ?? 0),
      spendBy: f.spend_by,
      status: budgetStatus({ totalCents: f.total_cents, spentCents, spendBy: f.spend_by, today: ctx.today }),
    };
  });
}
