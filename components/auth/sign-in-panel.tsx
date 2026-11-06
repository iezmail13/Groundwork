import Link from "next/link";
import { LogIn } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Button } from "@/components/ui/button";
import { DEMO_USERS, devShortcutEnabled, googleSignInEnabled } from "@/lib/demo";
import { devSignIn } from "@/app/login/actions";

export type SignInMode = "login" | "signup";

const ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one below.",
  demo: "The demo sign-in didn't work. Run npm run seed, then try again.",
  google: "Google sign-in didn't finish. Try again, or use the email link below.",
};

/** The message for an `?error=` code, if it's one we know. */
export function signInError(code: unknown) {
  return typeof code === "string" ? ERRORS[code] : undefined;
}

const COPY = {
  login: {
    title: "Sign in to Groundwork",
    google: "Use your Google account, or we'll email you a link. No password needed.",
    email: "We'll email you a link. No password needed.",
  },
  signup: {
    title: "Create your free Groundwork account",
    google: "Continue with Google, or we'll email you a link to get started. No password, no credit card.",
    email: "We'll email you a link to get started. No password, no credit card.",
  },
} as const;

/**
 * The sign-in form with its heading and links (D117). The full /login and
 * /signup pages and the modal over the landing page all render this, so the
 * two can't drift apart. Auth itself is unchanged: the magic-link action,
 * Google, `next` and the development shortcut work as they always have.
 */
export function SignInPanel({
  mode,
  next = "/",
  error,
  titleId,
  heading: Heading = "h1",
  inModal = false,
}: {
  mode: SignInMode;
  /** Where to land after signing in, already checked with safeNext. */
  next?: string;
  error?: string;
  titleId: string;
  heading?: "h1" | "h2";
  /** In the modal, switching between sign-in and sign-up replaces the history entry. */
  inModal?: boolean;
}) {
  const google = googleSignInEnabled();
  const copy = COPY[mode];
  const linkClass = "font-semibold text-accent underline underline-offset-4";
  return (
    <div>
      <Heading id={titleId} className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
        {copy.title}
      </Heading>
      <p className="mt-2 text-ink-muted">{google ? copy.google : copy.email}</p>
      <div className="mt-7">
        {error ? (
          <p role="alert" className="mb-4 border-l-4 border-ink pl-3 text-sm font-semibold">
            {error}
          </p>
        ) : null}
        {mode === "login" ? (
          <LoginForm next={next === "/" ? undefined : next} google={google} />
        ) : (
          <LoginForm google={google} submitLabel="Email me a link to get started" />
        )}
        {mode === "login" ? (
          <p className="mt-6 text-sm text-ink-muted">
            Just looking?{" "}
            <Link href="/demo" className={linkClass}>
              Try the demo
            </Link>{" "}
            without an account. New to Groundwork?{" "}
            <Link href="/signup" replace={inModal} className={linkClass}>
              Start free
            </Link>
            .
          </p>
        ) : (
          <p className="mt-8 border-t border-rule pt-5 text-sm text-ink-muted">
            Next, you&apos;ll name your organization and invite your team. Already using Groundwork?{" "}
            <Link href="/login" replace={inModal} className={linkClass}>
              Sign in
            </Link>
            .
          </p>
        )}

        {mode === "login" && devShortcutEnabled() ? (
          <section aria-labelledby={`${titleId}-dev`} className="mt-8 border-t border-dashed border-rule pt-5">
            <h2 id={`${titleId}-dev`} className="font-heading text-sm font-bold">
              Development shortcut
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Sign in as a seeded demo user without email. Hidden in production.</p>
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
      </div>
    </div>
  );
}
