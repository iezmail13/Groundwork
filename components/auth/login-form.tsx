"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { sendMagicLink } from "@/app/login/actions";
import { idle } from "@/lib/action-state";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { keepValues } from "@/lib/forms";

export function LoginForm({ next, defaultEmail }: { next?: string; defaultEmail?: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, idle);
  const sent = state.status === "success";
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
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
        {sent ? "Send another link" : "Email me a sign-in link"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
