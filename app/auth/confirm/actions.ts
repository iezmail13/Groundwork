"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formObject } from "@/lib/action-state";
import { safeNext } from "@/lib/safe-next";

const confirmInput = z.object({
  token_hash: z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["email", "magiclink", "signup", "invite"]),
  next: z.string().max(500).optional(),
});

/**
 * Verifies a sign-in link's token hash. It runs only on POST, after the person
 * presses the button on /auth/confirm, so a mail scanner that opens the link
 * can't use up the token. No PKCE verifier is involved, so the link works in
 * any browser or device.
 */
export async function confirmSignIn(formData: FormData): Promise<void> {
  const parsed = confirmInput.safeParse(formObject(formData));
  if (!parsed.success) redirect("/login?error=link");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: parsed.data.type, token_hash: parsed.data.token_hash });
  if (error) redirect("/login?error=link");
  redirect(safeNext(parsed.data.next));
}
