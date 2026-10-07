"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Disclosure menu with the ARIA menu pattern: arrow keys move between items,
 * Escape closes and returns focus to the button, clicking outside closes.
 */
export function Menu({
  button,
  buttonClassName = "",
  buttonLabel,
  placement = "top",
  children,
}: {
  button: ReactNode;
  buttonClassName?: string;
  buttonLabel: string;
  placement?: "top" | "bottom";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = () => setOpen(false);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={buttonLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {button}
      </button>
      {open ? (
        <div
          ref={listRef}
          id={id}
          role="menu"
          aria-label={buttonLabel}
          className={`absolute left-0 z-50 min-w-56 rounded-lg border border-rule bg-canvas p-1 text-ink ${
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-panel focus-visible:bg-panel";
