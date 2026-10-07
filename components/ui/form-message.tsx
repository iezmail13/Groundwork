import { CircleAlert, CircleCheck } from "lucide-react";
import type { ActionState } from "@/lib/action-state";

/** Announces the result of a form submission (icon + text, never colour alone). */
export function FormMessage({ state, className = "" }: { state: ActionState; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      {state.message && state.status !== "idle" ? (
        <p
          className={`flex items-start gap-2 text-sm ${
            state.status === "error" ? "font-semibold" : ""
          }`}
        >
          {state.status === "error" ? (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            <span className="sr-only">{state.status === "error" ? "Error: " : "Done: "}</span>
            {state.message}
          </span>
        </p>
      ) : null}
    </div>
  );
}
