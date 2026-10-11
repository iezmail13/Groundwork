"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id } from "@/lib/validation";
import { CURRENCIES, parseCents } from "@/lib/money";

// RLS limits all of this to owners and managers; the database refuses
// allocations that add up to more than their fund.

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

const NOT_ALLOWED = "You can't change this, or it no longer exists.";
const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);

const amount = (field: string) =>
  z
    .string({ error: "Enter an amount." })
    .transform((v, ctx) => {
      const cents = parseCents(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: `Enter ${field} like 10000 or 2,500.50.` });
        return z.NEVER;
      }
      return cents;
    });

const fundInput = z.object({
  organizationId: id,
  name: z.string({ error: "Add a name." }).trim().min(1, "Add a name.").max(120, "Use 120 characters or fewer."),
  description: z.string().trim().max(2000, "Use 2,000 characters or fewer.").optional(),
  total: amount("the total"),
  currency: z.enum(CURRENCIES, { error: "Pick a currency." }),
  projectId: id.optional(),
});

export async function createFund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fundInput.extend({ orgSlug: slug }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const fundId = crypto.randomUUID();
  const { error } = await supabase.from("funds").insert({
    id: fundId,
    organization_id: d.organizationId,
    name: d.name,
    description: d.description ?? null,
    total_cents: d.total,
    currency: d.currency,
    project_id: d.projectId ?? null,
  });
  if (error) return dbFailure(error);
  revalidateOrg();
  redirect(`/${d.orgSlug}/funds/${fundId}`);
}

export async function updateFund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fundInput.extend({ id }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funds")
    .update({ name: d.name, description: d.description ?? null, total_cents: d.total, currency: d.currency, project_id: d.projectId ?? null })
    .eq("id", d.id)
    .select("id");
  if (error?.hint === "fund_overallocated") {
    return failure("The total can't be less than what's already allocated. Reduce the parts first.", {
      total: ["Less than what's allocated."],
    });
  }
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ALLOWED);
  revalidateOrg();
  return success("Saved.");
}

export async function deleteFund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id, orgSlug: slug }).safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("funds").delete().eq("id", parsed.data.id).select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ALLOWED);
  revalidateOrg();
  redirect(`/${parsed.data.orgSlug}/funds`);
}

const allocationInput = z.object({
  organizationId: id,
  fundId: id,
  label: z.string({ error: "Say what it's for." }).trim().min(1, "Say what it's for.").max(120, "Use 120 characters or fewer."),
  amount: amount("the amount").refine((c) => c > 0, "Enter more than zero."),
  projectId: id.optional(),
});

function overallocated(error: { hint?: string | null } | null): ActionState | null {
  return error?.hint === "fund_overallocated"
    ? failure("That's more than the fund has left to allocate.", { amount: ["More than what's left."] })
    : null;
}

export async function addAllocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = allocationInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("fund_allocations").insert({
    organization_id: d.organizationId,
    fund_id: d.fundId,
    label: d.label,
    amount_cents: d.amount,
    project_id: d.projectId ?? null,
  });
  if (error) return overallocated(error) ?? dbFailure(error);
  revalidateOrg();
  return success(`Allocated to ${d.label}.`);
}

export async function updateAllocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = allocationInput.extend({ id }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fund_allocations")
    .update({ label: d.label, amount_cents: d.amount, project_id: d.projectId ?? null })
    .eq("id", d.id)
    .select("id");
  if (error) return overallocated(error) ?? dbFailure(error);
  if (!data?.length) return failure(NOT_ALLOWED);
  revalidateOrg();
  return success("Saved.");
}

export async function deleteAllocation(formData: FormData): Promise<void> {
  const parsed = z.object({ id }).safeParse(formObject(formData));
  if (!parsed.success) throw new Error("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.from("fund_allocations").delete().eq("id", parsed.data.id);
  if (error) throw new Error("Couldn't remove that part. Try again.");
  revalidateOrg();
}
