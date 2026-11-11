"use client";

import { useActionState } from "react";
import { PlayCircle } from "lucide-react";
import { startDemo } from "@/app/demo/actions";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/action-state";
import { Turnstile } from "./turnstile";

/** "Start the demo": the bot check (when it's set up), then a private demo (D115). */
export function DemoForm({ siteKey, again = false }: { siteKey: string | null; again?: boolean }) {
  const [state, action] = useActionState(startDemo, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      {siteKey ? <Turnstile siteKey={siteKey} resetKey={state} /> : null}
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Setting up your demo…" className="w-full">
        <PlayCircle aria-hidden className="size-4" />
        {again ? "Start a new demo" : "Start the demo"}
      </SubmitButton>
    </form>
  );
}
