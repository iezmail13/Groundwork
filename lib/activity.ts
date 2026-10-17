import type { Translate } from "@/lib/terminology/t";
import { lower } from "@/lib/terminology/t";
import type { ActivityRow } from "@/lib/queries";
import type { LabelKey } from "@/lib/terminology/defaults";

const ENTITY_KEY: Record<string, LabelKey> = {
  project: "project",
  task: "task",
  event: "event",
  document: "document",
  participant: "participant",
};

/** Branding changes (D99), worded after the actor's name. */
const BRANDING: Record<string, string> = {
  changed_accent: "changed the accent colour",
  reset_accent: "reset the accent colour",
  uploaded_logo: "uploaded a new logo",
  removed_logo: "removed the logo",
  uploaded_dark_logo: "uploaded a dark-mode logo",
  removed_dark_logo: "removed the dark-mode logo",
  allowed_personal_accents: "let people choose their own accent colour",
  blocked_personal_accents: "set one accent colour for everyone",
  showed_illustrations: "turned illustrations on",
  hid_illustrations: "turned illustrations off",
};

/** Reports (D109), worded after the actor's name. */
const REPORT: Record<string, string> = {
  generated: "generated a report",
  exported_csv: "downloaded a report as CSV",
  printed: "printed a report",
  shared: "shared a report by link",
  revoked: "revoked a report link",
};

/** "completed task" / "moved task to In progress" — the verb phrase after the actor's name. */
export function describeActivity(a: ActivityRow, t: Translate): string {
  if (a.entity_type === "organization") return BRANDING[a.action] ?? "changed the branding";
  if (a.entity_type === "report") return REPORT[a.action] ?? "used a report";
  // funds aren't a relabelled primitive, so they keep their own word
  const noun = a.entity_type === "fund" ? "fund" : lower(t(ENTITY_KEY[a.entity_type] ?? "task"));
  if (a.action === "moved" && a.metadata.to) {
    const to = a.metadata.to as "todo" | "in_progress" | "done";
    return `moved a ${noun} to ${t(`status.${to}`)}`;
  }
  const article = a.action === "created" || a.action === "uploaded" ? "a" : "the";
  return `${a.action} ${article} ${noun}`;
}

export function activityHref(a: ActivityRow, base: string): string | null {
  if (a.action === "deleted") return null;
  switch (a.entity_type) {
    case "project":
      return `${base}/projects/${a.entity_id}`;
    case "task":
      return `${base}/tasks/${a.entity_id}`;
    case "document":
      return `${base}/documents`;
    case "event":
      return `${base}/calendar?view=agenda`;
    case "fund":
      return `${base}/funds/${a.entity_id}`;
    case "participant":
      return `${base}/attendance/participants/${a.entity_id}`;
    case "organization":
      return `${base}/settings?view=branding`;
    case "report":
      return `${base}/reports`;
    default:
      return null;
  }
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return `${Math.round(d / 7)} wk ago`;
}
