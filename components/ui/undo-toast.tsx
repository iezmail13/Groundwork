"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleCheck, Undo2, X } from "lucide-react";

type Toast = { id: number; message: string; onUndo?: () => void };
const ShowToast = createContext<(message: string, onUndo?: () => void) => void>(() => {});

/** How long the Undo stays on screen (D101). */
const UNDO_MS = 5000;

/**
 * One short-lived message at the bottom of the screen, with an Undo button,
 * e.g. after ticking a task done. It's announced politely, stays put while
 * hovered or focused, and leaves after five seconds.
 */
export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [paused, setPaused] = useState(false);
  const next = useRef(0);

  const show = useCallback((message: string, onUndo?: () => void) => {
    next.current += 1;
    setToast({ id: next.current, message, onUndo });
  }, []);

  useEffect(() => {
    if (!toast || paused) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [toast, paused]);

  return (
    <ShowToast.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:justify-end">
        {toast ? (
          <div
            key={toast.id}
            className="toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-ink bg-ink px-4 py-2.5 text-canvas"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            <span className="text-sm font-semibold">{toast.message}</span>
            {toast.onUndo ? (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-canvas px-2 py-1 font-heading text-sm font-semibold hover:bg-canvas hover:text-ink"
                onClick={() => {
                  toast.onUndo?.();
                  setToast(null);
                }}
              >
                <Undo2 aria-hidden className="size-4" />
                Undo
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-canvas hover:text-ink"
              onClick={() => setToast(null)}
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </ShowToast.Provider>
  );
}

export function useUndoToast() {
  return useContext(ShowToast);
}
