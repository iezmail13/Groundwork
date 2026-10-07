import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-y border-dashed border-rule px-1 py-10 sm:items-center sm:text-center">
      {icon ? <div className="text-ink-muted [&_svg]:size-7">{icon}</div> : null}
      <h2 className="text-lg font-bold">{title}</h2>
      {children ? <div className="max-w-md text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
