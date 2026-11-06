"use client";

import { createContext, useContext } from "react";
import type { Viewer } from "./roles";

const ViewerContext = createContext<Viewer | null>(null);

/** Who is looking, so client components can mirror the database's edit rules. */
export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error("useViewer must be used inside <ViewerProvider>");
  return viewer;
}
