"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setTaskStatus } from "@/app/[orgSlug]/tasks/actions";

/** Round checkbox that marks a task done (or reopens it). */
export function TaskCheckbox({
  id,
  title,
  done,
  onCompleteStart,
}: {
  id: string;
  title: string;
  done: boolean;
  /** Lets a parent play the strike-through/slide-out animation first. */
  onCompleteStart?: () => void;
}) {
  const [checked, setChecked] = useState(done);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = () => {
    const next = !checked;
    setChecked(next);
    if (next) onCompleteStart?.();
    startTransition(async () => {
      const result = await setTaskStatus({ id, status: next ? "done" : "todo" });
      if (!result.ok) {
        setChecked(!next);
        router.refresh();
      }
    });
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Done: ${title}`}
      disabled={pending}
      onClick={toggle}
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink transition-colors ${
        checked ? "bg-primary text-on-primary" : "bg-canvas hover:bg-panel"
      }`}
    >
      {checked ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
    </button>
  );
}
