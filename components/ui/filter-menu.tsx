"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

/**
 * A page's filters behind one "Filters" button (D110). The panel stays in the
 * page while it's closed, so a form around it still sends its fields. It
 * closes on Escape (focus returns to the button) or a click outside. `count`
 * is how many filters are on, shown on the button.
 */
export function FilterMenu({ count, children, label = "Filters" }: { count: number; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("select, input, button, a[href]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={count ? `${label}, ${count} on` : label}
        onClick={() => setOpen(!open)}
        className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 font-heading text-sm font-semibold hover:bg-panel ${
          count ? "border-accent text-accent" : "border-rule"
        }`}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        {label}
        {count ? (
          <span aria-hidden className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs leading-5 text-on-accent">
            {count}
          </span>
        ) : null}
        <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        role="group"
        aria-label={label}
        hidden={!open}
        className="absolute top-full left-0 z-30 mt-2 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-lg border border-rule bg-canvas p-4"
      >
        {children}
      </div>
    </div>
  );
}
