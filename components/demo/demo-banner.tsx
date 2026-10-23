"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, LogOut } from "lucide-react";
import { endDemo } from "@/app/demo/actions";
import { SubmitButton } from "@/components/ui/submit-button";

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

/** Shown across the app during a demo: the time left, End demo and Start free (D115). */
export function DemoBanner({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      const m = minutesLeft(expiresAt);
      setLeft(m);
      if (m === 0) router.replace("/demo?ended=1");
    };
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [expiresAt, router]);

  const time = left === null ? null : left >= 60 ? `${Math.floor(left / 60)} h ${left % 60} min` : `${left} min`;
  return (
    <section
      aria-label="Demo"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-panel px-4 py-2 text-sm sm:px-8"
    >
      <p className="flex min-w-0 flex-1 items-center gap-2">
        <Clock aria-hidden className="size-4 shrink-0" />
        <span>
          <strong className="font-semibold">You&apos;re in a demo.</strong> Nobody else can see it
          {time ? (
            <>
              , and it ends in <strong className="font-semibold">{time}</strong>
            </>
          ) : null}
          . Everything in it is deleted when it ends.
        </span>
      </p>
      <form action={endDemo} className="flex items-center gap-2">
        <Link href="/signup" className="font-heading font-semibold text-accent underline underline-offset-2">
          Start free
        </Link>
        <SubmitButton variant="secondary" size="sm" pendingLabel="Ending…">
          <LogOut aria-hidden className="size-4" />
          End demo
        </SubmitButton>
      </form>
    </section>
  );
}
