"use client";

import { useActionState } from "react";
import { saveNotificationSettings } from "@/app/[orgSlug]/notifications/actions";
import { idle } from "@/lib/action-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import type { NotificationType } from "@/lib/notifications";

/** Settings → Notifications (D103): one switch per kind of notification. */
export function NotificationSettings({
  organizationId,
  choices,
}: {
  organizationId: string;
  choices: { type: NotificationType; label: string; on: boolean }[];
}) {
  const [state, action, pending] = useActionState(saveNotificationSettings, idle);
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <fieldset className="flex flex-col">
        <legend className="sr-only">Kinds of notification</legend>
        <ul className="divide-y divide-rule border-y border-rule">
          {choices.map((c) => (
            <li key={c.type}>
              <label className="flex cursor-pointer items-center gap-3 py-3">
                <input
                  type="checkbox"
                  name={`notify.${c.type}`}
                  defaultChecked={c.on}
                  className="size-5 shrink-0 accent-[var(--accent)]"
                />
                <span>{c.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}
