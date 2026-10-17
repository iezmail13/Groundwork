"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A button in the top bar that opens a panel beneath it: a popover on wide
 * screens, a full-height sheet on small ones. Escape, the close button or a
 * click outside closes it and focus returns to the button. The notification
 * bell and the activity menu share it (D103, D110).
 */
export function TopBarPanel({
  label,
  icon,
  badge,
  heading,
  actions,
  footer,
  onOpen,
  busy = false,
  onRail = false,
  children,
}: {
  /** The button's accessible name, which can carry a count. */
  label: string;
  icon: ReactNode;
  badge?: ReactNode;
  heading: string;
  actions?: ReactNode;
  footer: (close: () => void) => ReactNode;
  onOpen?: () => void;
  busy?: boolean;
  onRail?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const headingId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        className={`relative inline-flex size-9 items-center justify-center rounded-md border border-transparent ${
          onRail ? "hover:bg-rail-hover" : "text-ink hover:border-rule hover:bg-panel"
        }`}
      >
        {icon}
        {badge}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink min-[900px]:absolute min-[900px]:inset-auto min-[900px]:top-full min-[900px]:right-0 min-[900px]:mt-2 min-[900px]:max-h-[70vh] min-[900px]:w-[24rem] min-[900px]:rounded-lg min-[900px]:border min-[900px]:border-rule"
        >
          <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
            <h2 id={headingId} tabIndex={-1} data-autofocus className="font-heading text-base font-bold focus:outline-none">
              {heading}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              {actions}
              <button
                type="button"
                aria-label={`Close ${heading.toLowerCase()}`}
                onClick={close}
                className="inline-flex size-8 items-center justify-center rounded hover:bg-panel"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={busy}>
            {children(() => setOpen(false))}
          </div>
          <div className="border-t border-rule px-4 py-3">{footer(() => setOpen(false))}</div>
        </div>
      ) : null}
    </div>
  );
}
