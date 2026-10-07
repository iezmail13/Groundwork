import type { Metadata } from "next";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/ui/submit-button";
import { safeNext } from "@/lib/safe-next";
import { confirmSignIn } from "./actions";

export const metadata: Metadata = { title: "Finish signing in" };

/**
 * Landing page for sign-in emails. Opening it (as mail scanners do) changes
 * nothing; the token is only used when the form is submitted.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "email";
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);

  if (!tokenHash) {
    return (
      <AuthFrame title="This link is incomplete" subtitle="It's missing the part that signs you in.">
        <Link href="/login" className="underline underline-offset-4">
          Request a new sign-in link
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Finish signing in" subtitle="Press the button to sign in to Groundwork on this device.">
      <form action={confirmSignIn} className="flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <SubmitButton pendingLabel="Signing in…">
          <LogIn aria-hidden className="size-4" />
          Continue to Groundwork
        </SubmitButton>
      </form>
      <p className="mt-6 text-sm text-ink-muted">
        Didn&apos;t ask to sign in? Close this page; nothing happens until you press the button.
      </p>
    </AuthFrame>
  );
}
