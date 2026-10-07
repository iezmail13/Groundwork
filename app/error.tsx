"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4">
      <ErrorPanel error={error} reset={reset} />
    </main>
  );
}
