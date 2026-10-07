"use client";

import { createContext, useContext, useMemo } from "react";
import type { LabelForm, LabelKey } from "./defaults";
import type { Translate } from "./t";

type Resolved = Record<LabelKey, { one: string; other: string }>;

const TerminologyContext = createContext<Resolved | null>(null);

export function TerminologyProvider({ labels, children }: { labels: Resolved; children: React.ReactNode }) {
  return <TerminologyContext.Provider value={labels}>{children}</TerminologyContext.Provider>;
}

/** Client-side t(). Labels are resolved on the server and passed down. */
export function useT(): Translate {
  const labels = useContext(TerminologyContext);
  if (!labels) throw new Error("useT must be used inside <TerminologyProvider>");
  return useMemo(() => (key: LabelKey, form: LabelForm = "one") => labels[key][form], [labels]);
}
