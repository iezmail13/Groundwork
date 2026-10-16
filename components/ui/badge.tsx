import type { ReactNode } from "react";

export type BadgeVariant = "filled" | "outline" | "quiet" | "accent" | "good" | "warn" | "bad";

/**
 * A label with an icon. Neutral badges are filled (strong), outlined
 * (informational) or quiet; status badges use the fixed status colours as a
 * tint with readable text and a solid dot (D83). Status is always text plus
 * an icon, never colour alone.
 */
export function Badge({
  variant = "outline",
  icon,
  dot = false,
  children,
  className = "",
}: {
  variant?: BadgeVariant;
  icon?: ReactNode;
  /** A solid dot in the status colour, before the icon (status variants only). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    filled: "bg-ink text-canvas border border-ink font-semibold",
    outline: "border border-ink text-ink",
    quiet: "border border-rule text-ink-muted",
    accent: "bg-accent-tint text-accent border border-accent font-semibold",
    good: "bg-good-tint text-good-ink border border-good font-semibold",
    warn: "bg-warn-tint text-warn-ink border border-warn font-semibold",
    bad: "bg-bad-tint text-bad-ink border border-bad font-semibold",
  }[variant];
  const dotColor = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", accent: "bg-accent" }[variant as "good"];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-heading text-xs whitespace-nowrap ${styles} ${className}`}
    >
      {dot && dotColor ? <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dotColor}`} /> : null}
      {icon}
      {children}
    </span>
  );
}
