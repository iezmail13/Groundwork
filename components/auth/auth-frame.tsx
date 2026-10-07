import type { ReactNode } from "react";
import { LogoBadge } from "@/components/logo";

/** Simple centred frame for sign-in, onboarding and invite pages. */
export function AuthFrame({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center gap-3 bg-rail px-4 py-3 text-rail-ink sm:px-6">
        <span className="logo-link inline-flex items-center gap-2.5">
          <LogoBadge size={34} />
          <span className="font-heading text-lg font-extrabold tracking-tight">Groundwork</span>
        </span>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-ink-muted">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
