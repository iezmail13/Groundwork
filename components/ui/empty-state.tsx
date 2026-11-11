import type { ReactNode } from "react";
import { Illustration, type IllustrationKind } from "@/components/logo";

/**
 * An empty page or section. With `illustration`, it shows the matching
 * Groundwork artwork by default; an organization can switch the artwork off,
 * and then `icon` shows instead (D99).
 */
export function EmptyState({
  icon,
  illustration,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  illustration?: IllustrationKind;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-y border-dashed border-rule px-1 py-10 sm:items-center sm:text-center">
      {illustration ? (
        <div className="gw-illustration rounded-xl px-2 pt-1">
          <Illustration kind={illustration} size={132} />
        </div>
      ) : null}
      {icon ? <div className={`text-ink-muted [&_svg]:size-7 ${illustration ? "gw-empty-icon" : ""}`}>{icon}</div> : null}
      <h2 className="text-lg font-bold">{title}</h2>
      {children ? <div className="max-w-md text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
