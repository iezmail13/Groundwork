import {
  Building2,
  CalendarDays,
  FileChartColumn,
  FileText,
  FolderKanban,
  ListChecks,
  PiggyBank,
  Users,
  type LucideIcon,
} from "lucide-react";

/** The icon for each kind of thing in the activity log (D103). */
export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  task: ListChecks,
  event: CalendarDays,
  document: FileText,
  participant: Users,
  fund: PiggyBank,
  organization: Building2,
  report: FileChartColumn,
};

export const activityIcon = (entityType: string): LucideIcon => ACTIVITY_ICONS[entityType] ?? ListChecks;
