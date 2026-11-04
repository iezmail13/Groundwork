import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPage } from "@/components/auth/sign-in-page";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Start free" };

/**
 * "Start free": the same Google or email-link sign-in as /login, worded for
 * new accounts. Once signed in, a new person goes from / to creating their
 * organization (or to any invitations waiting for them). From a public page
 * it opens in a modal instead (D117).
 */
export default async function SignupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) redirect("/");

  return <SignInPage mode="signup" />;
}
