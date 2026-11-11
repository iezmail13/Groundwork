"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Mail, UserRound } from "lucide-react";
import { Avatar } from "@/components/people/avatar";
import { PresenceBadge } from "@/components/people/presence";
import { MessageButton } from "@/components/chat/message-button";

export type PeekPerson = {
  userId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  title: string | null;
  email: string;
  /** Their role here, in the org's words. */
  role: string;
};

/**
 * A person's name that opens a short profile card where they appear (D112):
 * photo, title, online status, email, their role here, a message button and a
 * link to the full profile. No trip to Settings needed.
 */
export function ProfilePeek({ person, href, isYou }: { person: PeekPerson; href: string; isYou: boolean }) {
  const [open, setOpen] = useState(false);
  // placed against the window, so a scrolling table around the name can't clip it
  const [at, setAt] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const cardId = useId();
  const headingId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => {
          const r = buttonRef.current?.getBoundingClientRect();
          if (r) {
            const left = Math.max(8, Math.min(r.left, window.innerWidth - 336));
            // opens above the name when there isn't room for the card below it
            setAt(window.innerHeight - r.bottom < 280 ? { bottom: window.innerHeight - r.top + 8, left } : { top: r.bottom + 8, left });
          }
          setOpen(!open);
        }}
        className="inline-flex items-center gap-2 rounded-md text-left font-semibold hover:underline"
      >
        <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" />
        <span>{person.name}</span>
        <span className="sr-only">: show profile</span>
      </button>
      {open && at ? (
        <span
          id={cardId}
          role="dialog"
          aria-labelledby={headingId}
          style={{ top: at.top, bottom: at.bottom, left: at.left }}
          className="fixed z-40 flex w-[min(20rem,calc(100vw-1rem))] flex-col gap-3 rounded-lg border border-rule bg-canvas p-4 font-normal"
        >
          <span className="flex items-center gap-3">
            <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="lg" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span id={headingId} className="truncate font-heading text-base font-bold">
                {person.name}
              </span>
              {person.title ? <span className="truncate text-sm text-ink-muted">{person.title}</span> : null}
              <PresenceBadge userId={person.userId} />
            </span>
          </span>
          <span className="flex flex-col gap-1 border-t border-rule pt-3 text-sm">
            <span>
              <span className="text-ink-muted">Role here: </span>
              <span className="font-semibold">{person.role}</span>
            </span>
            <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 text-accent hover:underline">
              <Mail aria-hidden className="size-4" />
              {person.email}
            </a>
          </span>
          <span className="flex flex-wrap gap-2">
            {isYou ? null : <MessageButton userId={person.userId} name={person.name} />}
            <Link href={href} className="inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 font-heading text-sm font-semibold hover:bg-panel">
              <UserRound aria-hidden className="size-4" />
              Full profile
            </Link>
          </span>
        </span>
      ) : null}
    </span>
  );
}
