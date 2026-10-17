"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { failure, success, type ActionState } from "@/lib/action-state";

const tokenSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);

export async function acceptInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) return failure("This invitation link is malformed.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { token: parsed.data });
  if (error || !data) return failure(error?.message ?? "We couldn't accept this invitation.");
  redirect(`/${data}/dashboard`);
}

export async function declineInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) return failure("This invitation link is malformed.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_invitation", { token: parsed.data });
  if (error) return failure("We couldn't decline this invitation. It may already be gone.");
  revalidatePath("/invitations");
  return success("Declined.");
}
