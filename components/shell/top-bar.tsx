import type { ReactNode } from "react";

/**
 * The bar across the top of the work area on wide screens. Its right side
 * holds the viewer's controls (the theme toggle now; notifications and chat
 * join it later), and anything passed as `notice` sits full-width beneath,
 * like the scheduled-maintenance banner. Small screens show the same
 * controls in the sidebar's top bar instead.
 */
export function TopBar({ actions, notice }: { actions: ReactNode; notice?: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 bg-canvas">
      <div className="hidden h-14 items-center justify-end gap-1 border-b border-rule px-4 sm:px-8 min-[900px]:flex">
        <div role="toolbar" aria-label="Your controls" className="flex items-center gap-1">
          {actions}
        </div>
      </div>
      {notice}
    </div>
  );
}
