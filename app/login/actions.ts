"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { failure, invalid, success, type ActionState } from "@/lib/action-state";
import { DEMO_USERS, devShortcutEnabled } from "@/lib/demo";
import { safeNext } from "@/lib/safe-next";
import { siteOrigin } from "@/lib/urls";

const emailSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  next: z.string().max(500).optional(),
});

export async function sendMagicLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    next: formData.get("next") ? String(formData.get("next")) : undefined,
  });
  if (!parsed.success) return invalid(parsed.error);

  const next = safeNext(parsed.data.next);
  const origin = await siteOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    if (error.status === 429) return failure("Too many sign-in emails were sent. Wait a minute and try again.");
    return failure("We couldn't send the sign-in link. Check the address and try again.");
  }
  return success(`Check ${parsed.data.email} for a sign-in link. It works once and expires in an hour.`);
}

const devSchema = z.object({
  email: z.enum(DEMO_USERS.map((u) => u.email) as [string, ...string[]]),
  next: z.string().max(500).optional(),
});

/**
 * Development-only: signs in as a seeded demo user without email. Disabled
 * (and the buttons hidden) when NODE_ENV is production.
 */
export async function devSignIn(formData: FormData): Promise<void> {
  if (!devShortcutEnabled()) throw new Error("The demo sign-in shortcut is disabled in production.");
  const parsed = devSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ? String(formData.get("next")) : undefined,
  });
  if (!parsed.success) throw new Error("Unknown demo user.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: parsed.data.email });
  if (error || !data.properties?.hashed_token) {
    redirect("/login?error=demo");
  }
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) redirect("/login?error=demo");
  redirect(safeNext(parsed.data.next));
}
