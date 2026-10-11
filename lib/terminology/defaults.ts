// The single source of default UI labels. This file (and the preset rows in
// the database) are the only places primitive labels may be spelled out;
// `npm run check:labels` fails if one appears anywhere else in the UI.

export const LABEL_KEYS = [
  "project",
  "task",
  "event",
  "document",
  "member",
  "status.todo",
  "status.in_progress",
  "status.done",
  "status.active",
  "status.archived",
  "role.owner",
  "role.manager",
  "role.admin",
  "role.staff",
  "section.dashboard",
  "section.calendar",
  "section.settings",
] as const;

export type LabelKey = (typeof LABEL_KEYS)[number];
export type LabelForm = "one" | "other";
export type LabelEntry = { one: string; other: string };
export type LabelMap = Partial<Record<LabelKey, Partial<LabelEntry>>>;

export const DEFAULT_LABELS: Record<LabelKey, LabelEntry> = {
  project: { one: "Project", other: "Projects" },
  task: { one: "Task", other: "Tasks" },
  event: { one: "Event", other: "Events" },
  document: { one: "Document", other: "Documents" },
  member: { one: "Member", other: "Members" },
  "status.todo": { one: "To do", other: "To do" },
  "status.in_progress": { one: "In progress", other: "In progress" },
  "status.done": { one: "Done", other: "Done" },
  "status.active": { one: "Active", other: "Active" },
  "status.archived": { one: "Archived", other: "Archived" },
  "role.owner": { one: "Owner", other: "Owners" },
  "role.manager": { one: "Manager", other: "Managers" },
  "role.admin": { one: "Admin", other: "Admins" },
  "role.staff": { one: "Staff", other: "Staff" },
  "section.dashboard": { one: "Dashboard", other: "Dashboard" },
  "section.calendar": { one: "Calendar", other: "Calendar" },
  "section.settings": { one: "Settings", other: "Settings" },
};
