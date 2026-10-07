import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { DEMO_USERS, devShortcutEnabled } from "@/lib/demo";
import { safeNext } from "@/lib/safe-next";
import { devSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one below.",
  demo: "The demo sign-in didn't work. Run npm run seed, then try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  return (
    <AuthFrame title="Sign in to Groundwork" subtitle="We'll email you a link. No password needed.">
      {error ? (
        <p role="alert" className="mb-4 border-l-4 border-ink pl-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}
      <LoginForm next={next === "/" ? undefined : next} />

      {devShortcutEnabled() ? (
        <section aria-labelledby="dev-signin" className="mt-8 border-t border-dashed border-rule pt-5">
          <h2 id="dev-signin" className="font-heading text-sm font-bold">
            Development shortcut
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in as a seeded demo user without email. Hidden in production.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-rule border-y border-rule">
            {DEMO_USERS.map((u) => (
              <li key={u.email}>
                <form action={devSignIn} className="flex items-center justify-between gap-3 py-2">
                  <input type="hidden" name="email" value={u.email} />
                  {next !== "/" ? <input type="hidden" name="next" value={next} /> : null}
                  <span className="min-w-0">
                    <span className="block font-semibold">{u.fullName}</span>
                    <span className="block truncate text-sm text-ink-muted">
                      {u.email} · {u.role}
                    </span>
                  </span>
                  <Button type="submit" variant="secondary" size="sm" aria-label={`Sign in as ${u.fullName}`}>
                    <LogIn aria-hidden className="size-4" />
                    Sign in
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AuthFrame>
  );
}
