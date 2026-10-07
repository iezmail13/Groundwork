"use client";

import { TriangleAlert, RotateCcw } from "lucide-react";
import { Button } from "./button";

export function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto my-16 flex max-w-lg flex-col items-start gap-4 border-y border-rule py-8">
      <TriangleAlert aria-hidden className="size-7" />
      <h2 className="text-xl font-bold">This page didn&apos;t load</h2>
      <p className="text-ink-muted">
        Something went wrong on our side while loading it. Your data is safe. Try again, and if it keeps happening,
        reload the page.
      </p>
      {error.digest ? <p className="text-sm text-ink-muted">Reference: {error.digest}</p> : null}
      <Button onClick={reset} variant="secondary">
        <RotateCcw aria-hidden className="size-4" />
        Try again
      </Button>
    </div>
  );
}
