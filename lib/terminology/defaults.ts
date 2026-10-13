// The single source of default UI labels. This file (and the preset rows in
// the database) are the only places primitive labels may be spelled out;
// `npm run check:labels` fails if one appears anywhere else in the UI.

export const LABEL_KEYS = [
  "project",
  "task",
  "event",
  "document",
  "member",
  "participant",
  "status.todo",
  "status.in_progress",
  "status.done",
  "status.active",
  "status.archived",
  "role.owner",
  "role.manager",
  "role.admin",
  "role.staff",
  "project_role.lead",
  "project_role.admin",
  "project_role.staff",
  "section.dashboard",
  "section.calendar",
  "section.settings",
  "section.attendance",
  "attendance.present",
  "attendance.late",
  "attendance.absent",
  "attendance.excused",
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
  participant: { one: "Participant", other: "Participants" },
  "status.todo": { one: "To do", other: "To do" },
  "status.in_progress": { one: "In progress", other: "In progress" },
  "status.done": { one: "Done", other: "Done" },
  "status.active": { one: "Active", other: "Active" },
  "status.archived": { one: "Archived", other: "Archived" },
  "role.owner": { one: "Owner", other: "Owners" },
  "role.manager": { one: "Manager", other: "Managers" },
  "role.admin": { one: "Admin", other: "Admins" },
  "role.staff": { one: "Staff", other: "Staff" },
  "project_role.lead": { one: "Lead", other: "Leads" },
  "project_role.admin": { one: "Admin", other: "Admins" },
  "project_role.staff": { one: "Staff", other: "Staff" },
  "section.dashboard": { one: "Dashboard", other: "Dashboard" },
  "section.calendar": { one: "Calendar", other: "Calendar" },
  "section.settings": { one: "Settings", other: "Settings" },
  "section.attendance": { one: "Attendance", other: "Attendance" },
  "attendance.present": { one: "Present", other: "Present" },
  "attendance.late": { one: "Late", other: "Late" },
  "attendance.absent": { one: "Absent", other: "Absent" },
  "attendance.excused": { one: "Excused", other: "Excused" },
};
