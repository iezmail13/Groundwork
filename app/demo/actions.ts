"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { failure, type ActionState } from "@/lib/action-state";
import { turnstileSiteKey } from "@/lib/demo";

// The public demo (D115). A visitor is signed in with a temporary anonymous
// account and given their own private sample organization, deleted with the
// account when the demo ends or its two hours are up.

export async function startDemo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const captchaToken = String(formData.get("cf-turnstile-response") ?? "").trim() || undefined;
  if (turnstileSiteKey() && !captchaToken) return failure("Complete the check that you're not a bot, then try again.");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) return failure("You're signed in to Groundwork already. Sign out first to try the demo.");
  if (!data.user) {
    const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
    if (error) {
      console.error("demo sign-in failed", { status: error.status, code: error.code, message: error.message });
      if (error.status === 429) return failure("A lot of people are trying the demo right now. Wait a few minutes and try again.");
      return failure("We couldn't start the demo just now. Try again in a minute.");
    }
  }
  const { data: slug, error } = await supabase.rpc("start_demo");
  if (error || !slug) {
    console.error("start_demo failed", { code: error?.code, message: error?.message });
    return failure("We couldn't set up the demo just now. Try again in a minute.");
  }
  redirect(`/${slug}/dashboard`);
}

/** Ends the visitor's demo now: their organization and temporary account are deleted. */
export async function endDemo(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user?.is_anonymous) {
    await supabase.rpc("end_demo");
    // the account is gone; this clears the cookies
    await supabase.auth.signOut();
  }
  redirect("/demo?ended=1");
}
