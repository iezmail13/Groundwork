"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org";
import { failure, formObject, invalid, type ActionState } from "@/lib/action-state";
import { id } from "@/lib/validation";

// Discussion boards (D106). RLS decides who may post, edit and remove.

const threadSchema = z.object({
  orgSlug: z.string().regex(/^[a-z0-9-]{1,48}$/),
  where: z.union([z.literal("org"), id]),
  title: z.string().trim().min(1, "Give it a title.").max(200, "Keep the title under 200 characters."),
  body: z.string().trim().min(1, "Say what it's about.").max(8000, "Keep it under 8000 characters."),
});

export async function startDiscussion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = threadSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discussions")
    .insert({
      organization_id: ctx.org.id,
      project_id: parsed.data.where === "org" ? null : parsed.data.where,
      author_id: ctx.userId,
      title: parsed.data.title,
      body: parsed.data.body,
    })
    .select("id")
    .single();
  if (error || !data) return failure("Couldn't start that discussion. You may no longer be able to post there.");
  revalidatePath("/[orgSlug]/discussions", "page");
  redirect(`${ctx.base}/discussions/${data.id}`);
}

const editSchema = z.object({
  discussionId: id,
  title: threadSchema.shape.title,
  body: threadSchema.shape.body,
});

export async function editDiscussion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = editSchema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discussions")
    .update({ title: parsed.data.title, body: parsed.data.body })
    .eq("id", parsed.data.discussionId)
    .select("id");
  if (error || !data?.length) return failure("Couldn't save. Only its author can edit a discussion.");
  revalidatePath("/[orgSlug]/discussions/[discussionId]", "page");
  return { status: "success", message: "Saved." };
}

export async function removeDiscussion(input: { orgSlug: string; discussionId: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ orgSlug: threadSchema.shape.orgSlug, discussionId: id }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getOrgContext(parsed.data.orgSlug);
  const supabase = await createClient();
  const { data, error } = await supabase.from("discussions").delete().eq("id", parsed.data.discussionId).select("id");
  if (error || !data?.length) return { ok: false };
  revalidatePath("/[orgSlug]/discussions", "page");
  redirect(`${ctx.base}/discussions`);
}
