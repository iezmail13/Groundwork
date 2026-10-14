import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { AuthFrame } from "@/components/auth/auth-frame";
import { createClient } from "@/lib/supabase/server";
import { googleSignInEnabled } from "@/lib/demo";

export const metadata: Metadata = { title: "Start free" };

/**
 * "Start free": the same Google or email-link sign-in as /login, worded for
 * new accounts. Once signed in, a new person goes from / to creating their
 * organization (or to any invitations waiting for them).
 */
export default async function SignupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");

  return (
    <AuthFrame
      title="Create your free Groundwork account"
      subtitle={
        googleSignInEnabled()
          ? "Continue with Google, or we'll email you a link to get started. No password, no credit card."
          : "We'll email you a link to get started. No password, no credit card."
      }
    >
      <LoginForm google={googleSignInEnabled()} submitLabel="Email me a link to get started" />
      <p className="mt-8 border-t border-rule pt-5 text-sm text-ink-muted">
        Next, you&apos;ll name your organization and invite your team.{" "}
        Already using Groundwork?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Sign in
        </Link>
        .
      </p>
    </AuthFrame>
  );
}
