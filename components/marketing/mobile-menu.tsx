"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { SITE_LINKS } from "./masthead";

/** The masthead's links on small screens: a disclosure that slides down. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);
  const linkClass = "block border-b border-rule py-3 font-heading text-base font-semibold text-ink";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-10 items-center justify-center rounded-md border border-rule text-ink hover:border-ink"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
      </button>
      <div
        id="site-menu"
        hidden={!open}
        className="menu-slide-down absolute inset-x-0 top-full z-20 border-b border-rule bg-canvas px-4 pb-4"
      >
        {SITE_LINKS.map((l) => (
          <Link key={l.href} href={l.href} onClick={close} className={linkClass}>
            {l.label}
          </Link>
        ))}
        <Link href="/login" onClick={close} className={linkClass}>
          Log in
        </Link>
      </div>
    </>
  );
}
