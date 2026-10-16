"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { sendMagicLink } from "@/app/login/actions";
import { idle } from "@/lib/action-state";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { keepValues } from "@/lib/forms";
import { GoogleButton } from "./google-button";

export function LoginForm({
  next,
  defaultEmail,
  google = false,
  submitLabel = "Email me a sign-in link",
}: {
  next?: string;
  defaultEmail?: string;
  google?: boolean;
  /** The email button's words: signing in, or getting started (/signup). */
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState(sendMagicLink, idle);
  const sent = state.status === "success";
  return (
    <div className="flex flex-col gap-5">
      {google ? (
        <>
          <GoogleButton next={next} />
          <p className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden>
            <span className="h-px flex-1 bg-rule" />
            or
            <span className="h-px flex-1 bg-rule" />
          </p>
        </>
      ) : null}
    <form action={action} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Work email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          placeholder="you@example.org"
          invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>
      <SubmitButton pending={pending} pendingLabel="Sending link…">
        <Mail aria-hidden className="size-4" />
        {sent ? "Send another link" : submitLabel}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
    </div>
  );
}
