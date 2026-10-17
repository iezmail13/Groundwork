"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id } from "@/lib/validation";
import { ACCOUNTING_NAMES } from "@/lib/budget";

// Settings → Finance (D108): a plain link to the organization's accounting
// software. No sign-in, credentials or API calls. Owners only (a database guard).

const schema = z.object({
  organizationId: id,
  accountingName: z.union([z.enum(ACCOUNTING_NAMES), z.literal("")]),
  accountingUrl: z
    .string()
    .trim()
    .max(500, "Keep the link under 500 characters.")
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use an https:// address."),
});

export async function saveAccountingLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { organizationId, accountingName, accountingUrl } = parsed.data;
  if (Boolean(accountingName) !== Boolean(accountingUrl)) {
    return failure("Pick the software and give its link, or clear both.", { accountingUrl: ["Pick the software and give its link, or clear both."] });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({ accounting_name: accountingName || null, accounting_url: accountingUrl || null })
    .eq("id", organizationId)
    .select("id");
  if (error || !data?.length) return failure(error?.code === "42501" ? "Only owners set this link." : "Couldn't save. Try again.");
  revalidatePath("/[orgSlug]", "layout");
  return success("Saved.");
}
