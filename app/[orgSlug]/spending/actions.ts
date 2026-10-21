"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org";
import { failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { parseCents } from "@/lib/money";
import { isIsoDate } from "@/lib/dates";
import { id } from "@/lib/validation";

// Finance (D108). RLS and decide_spending() decide who may submit, see and
// approve; these validate input.

const BUCKET = "receipts";
const RECEIPT_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);

function revalidate() {
  revalidatePath("/[orgSlug]/spending", "page");
  revalidatePath("/[orgSlug]/funds", "page");
  revalidatePath("/[orgSlug]/funds/[fundId]", "page");
  revalidatePath("/[orgSlug]/dashboard", "page");
}

/** The funds someone may spend against for a program: names only. */
export async function fundsFor(input: { projectId: string }): Promise<{ id: string; name: string }[]> {
  const parsed = z.object({ projectId: id }).safeParse(input);
  if (!parsed.success) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("spendable_funds", { project: parsed.data.projectId });
  return (data ?? []).map((f) => ({ id: f.id, name: f.name }));
}

export type ReceiptTicket = { ok: true; path: string; token: string } | { ok: false; message: string };

/** Step 1 of a receipt upload: a signed upload URL in the caller's own folder. */
export async function requestReceiptUpload(input: { orgSlug: string; size: number; mimeType: string }): Promise<ReceiptTicket> {
  const parsed = z
    .object({
      orgSlug: slug,
      size: z.number().int().positive().max(MAX_RECEIPT_BYTES, "Receipts can be at most 10 MB."),
      mimeType: z.string().refine((m) => m in RECEIPT_TYPES, "Use a photo (PNG, JPG, WebP) or a PDF."),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That receipt can't be used." };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const path = `${ctx.org.id}/${ctx.userId}/${crypto.randomUUID()}.${RECEIPT_TYPES[parsed.data.mimeType]}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Couldn't start the upload. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

const entrySchema = z.object({
  orgSlug: slug,
  projectId: id,
  fundId: id,
  amount: z.string().transform((v, c) => {
    const cents = parseCents(v);
    if (cents === null || cents <= 0) {
      c.addIssue({ code: "custom", message: "Enter an amount above zero, like 42.50." });
      return z.NEVER;
    }
    return cents;
  }),
  category: z.string().trim().min(1, "Pick or type a category.").max(60, "Keep the category under 60 characters."),
  spentOn: z.string().refine(isIsoDate, "Pick the date it was spent."),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters.").optional(),
  receiptPath: z.string().max(300).optional(),
});

export async function submitSpending(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = entrySchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const receipt = parsed.data.receiptPath || null;
  if (receipt) {
    if (!receipt.startsWith(`${ctx.org.id}/${ctx.userId}/`)) return failure("That receipt doesn't belong to you.");
    const { data: info } = await supabase.storage.from(BUCKET).info(receipt);
    const mime = (info?.contentType ?? "").split(";")[0]!.trim();
    if (!info || (info.size ?? 0) > MAX_RECEIPT_BYTES || !(mime in RECEIPT_TYPES)) {
      await supabase.storage.from(BUCKET).remove([receipt]);
      return failure("Use a photo (PNG, JPG, WebP) or a PDF up to 10 MB for the receipt.");
    }
  }
  const { error } = await supabase.from("spending_entries").insert({
    organization_id: ctx.org.id,
    project_id: parsed.data.projectId,
    fund_id: parsed.data.fundId,
    amount_cents: parsed.data.amount,
    category: parsed.data.category,
    spent_on: parsed.data.spentOn,
    note: parsed.data.note || null,
    receipt_path: receipt,
    submitted_by: ctx.userId,
  });
  if (error) {
    if (receipt) await supabase.storage.from(BUCKET).remove([receipt]);
    return failure("Couldn't submit that. Check that the fund pays for that work and that you can still see it.");
  }
  revalidate();
  return success("Submitted. It's waiting for approval.");
}

export async function withdrawSpending(input: { entryId: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ entryId: id }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data: row } = await supabase.from("spending_entries").select("receipt_path").eq("id", parsed.data.entryId).maybeSingle();
  const { data, error } = await supabase.from("spending_entries").delete().eq("id", parsed.data.entryId).select("id");
  if (error || !data?.length) return { ok: false };
  if (row?.receipt_path) await supabase.storage.from(BUCKET).remove([row.receipt_path]);
  revalidate();
  return { ok: true };
}

const DECISION_MESSAGES: Record<string, string> = {
  own_entry: "Nobody approves their own spending.",
  already_decided: "Someone has already decided on this. Refresh to see the latest.",
  rank: "Only someone ranked above them can decide on this.",
  not_approver: "Only the people who approve spending can do that.",
};

export async function decideSpending(input: { entryId: string; approve: boolean; note?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = z.object({ entryId: id, approve: z.boolean(), note: z.string().trim().max(500, "Keep the note under 500 characters.").optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Couldn't save that." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_spending", { entry: parsed.data.entryId, approve: parsed.data.approve, note: parsed.data.note || undefined });
  revalidate();
  return error ? { ok: false, message: DECISION_MESSAGES[error.hint ?? ""] ?? "Couldn't save that decision." } : { ok: true };
}

/** A short-lived link to view a receipt, for whoever may see it. */
export async function receiptLink(input: { entryId: string }): Promise<{ ok: true; url: string } | { ok: false }> {
  const parsed = z.object({ entryId: id }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data: row } = await supabase.from("spending_entries").select("receipt_path").eq("id", parsed.data.entryId).maybeSingle();
  if (!row?.receipt_path) return { ok: false };
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.receipt_path, 60);
  return data?.signedUrl ? { ok: true, url: data.signedUrl } : { ok: false };
}
