/**
 * Joins class names, skipping empty ones. The shadcn-style `cn` signature
 * without clsx or tailwind-merge (see docs/decisions.md D78): callers here
 * never pass conflicting Tailwind classes that would need merging.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
