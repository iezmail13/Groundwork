"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/invite/[token]/actions";
import { idle } from "@/lib/action-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function AcceptInviteForm({ token, orgName }: { token: string; orgName: string }) {
  const [state, action] = useActionState(acceptInvitation, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Joining…">Join {orgName}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
