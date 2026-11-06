"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";

// Session storage can throw (private windows, blocked storage), so every
// access is guarded and the banner simply shows again if it can't remember.
function readDismissed(id: string): boolean {
  try {
    return window.sessionStorage.getItem(id) === "dismissed";
  } catch {
    return false;
  }
}

const noop = () => () => {};

export function DismissibleBanner({ id, children }: { id: string; children: ReactNode }) {
  // read once on the client; the server always renders the banner
  const stored = useSyncExternalStore(noop, () => readDismissed(id), () => false);
  const [dismissed, setDismissed] = useState(false);
  if (stored || dismissed) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-accent bg-panel px-4 py-1.5 text-sm font-semibold sm:px-8">
      {children}
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            window.sessionStorage.setItem(id, "dismissed");
          } catch {}
        }}
        className="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent hover:border-rule"
        aria-label="Dismiss the maintenance notice"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
