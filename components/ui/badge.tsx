import type { ReactNode } from "react";

/**
 * Filled (strong signal, e.g. overdue) or outlined (informational). Status is
 * always text plus an icon, never colour alone.
 */
export function Badge({
  variant = "outline",
  icon,
  children,
  className = "",
}: {
  variant?: "filled" | "outline" | "quiet";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    filled: "bg-primary text-on-primary border border-primary font-medium",
    outline: "border border-ink-muted text-ink font-medium",
    quiet: "border border-rule text-ink-muted font-medium",
  }[variant];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${styles} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
