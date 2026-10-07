"use client";

import { ErrorPanel } from "@/components/ui/error-panel";

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} />;
}
