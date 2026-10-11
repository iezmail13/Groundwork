import { Check, Clock, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MarkStatus } from "@/lib/attendance-report";

export const STATUS_ICON = { present: Check, late: Clock, absent: X, excused: Minus } as const;

/**
 * An attendance mark as icon + word: filled for present, outlined for late,
 * quiet for absent and excused. Never colour alone.
 */
export function MarkBadge({ status, label }: { status: MarkStatus; label: string }) {
  const Icon = STATUS_ICON[status];
  const variant = status === "present" ? "filled" : status === "late" ? "outline" : "quiet";
  return (
    <Badge variant={variant} icon={<Icon aria-hidden className="size-3.5" />}>
      {label}
    </Badge>
  );
}
