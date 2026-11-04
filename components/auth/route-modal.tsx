"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * A page shown over the one underneath (D117), for the intercepted /login and
 * /signup routes. It's a native modal <dialog>, so the page behind is inert
 * and focus stays inside. Escape, the close button and a click on the
 * backdrop all go back in history, to the page it opened from, with no page
 * load; focus then returns to whatever opened it.
 */
export function RouteModal({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // The link that was clicked still has focus while the modal mounts. Kept
    // in a ref and taken once, since a re-run finds focus already inside.
    const active = document.activeElement;
    if (!opener.current && active instanceof HTMLElement && !dialog.contains(active)) opener.current = active;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, []);

  const close = () => router.back();

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className="gw-dialog gw-dialog-auth m-auto"
      onCancel={(event) => {
        // Escape: leave closing to the router, so the URL goes back to where it was
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // the dialog itself only receives the click when it lands on the backdrop
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="relative px-5 pt-6 pb-7 sm:px-8 sm:pt-8 sm:pb-9">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-md border border-transparent text-ink-muted hover:border-rule hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
