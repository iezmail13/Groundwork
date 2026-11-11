import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInPage } from "@/components/auth/sign-in-page";
import { signInError } from "@/components/auth/sign-in-panel";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

/** The full sign-in page. From a public page, "Log in" shows the same form in a modal instead (D117). */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) redirect(next);

  return <SignInPage mode="login" next={next} error={signInError(params.error)} />;
}
