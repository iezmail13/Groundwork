import "server-only";
import { createClient } from "@/lib/supabase/server";

// Funds and allocations. RLS limits every query to owners and managers;
// anyone else gets no rows.

export type Allocation = {
  id: string;
  label: string;
  amount_cents: number;
  project_id: string | null;
  position: number;
  project: { id: string; name: string } | null;
};

export type Fund = {
  id: string;
  name: string;
  description: string | null;
  total_cents: number;
  currency: string;
  project_id: string | null;
  created_at: string;
  project: { id: string; name: string } | null;
  allocations: Allocation[];
};

const FUND_SELECT =
  "id, name, description, total_cents, currency, project_id, created_at, project:projects(id, name), allocations:fund_allocations(id, label, amount_cents, project_id, position, project:projects(id, name))";

function tidy(fund: Fund): Fund {
  return { ...fund, allocations: [...fund.allocations].sort((a, b) => a.position - b.position) };
}

export async function getFunds(orgId: string): Promise<Fund[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funds").select(FUND_SELECT).eq("organization_id", orgId).order("name");
  if (error) throw error;
  return ((data ?? []) as Fund[]).map(tidy);
}

export async function getFund(orgId: string, fundId: string): Promise<Fund | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("funds").select(FUND_SELECT).eq("organization_id", orgId).eq("id", fundId).maybeSingle();
  return data ? tidy(data as Fund) : null;
}

/** Funds linked to a project, or with a part allocated to it. */
export async function getProjectFunding(orgId: string, projectId: string): Promise<Fund[]> {
  const funds = await getFunds(orgId);
  return funds.filter((f) => f.project_id === projectId || f.allocations.some((a) => a.project_id === projectId));
}

export function allocatedCents(fund: Pick<Fund, "allocations">): number {
  return fund.allocations.reduce((sum, a) => sum + a.amount_cents, 0);
}
