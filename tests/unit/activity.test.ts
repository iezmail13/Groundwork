import { describe, expect, it } from "vitest";
import { describeActivity, timeAgo } from "@/lib/activity";
import { createTranslator } from "@/lib/terminology/t";
import type { ActivityRow } from "@/lib/queries";

const row = (patch: Partial<ActivityRow>): ActivityRow => ({
  id: "1",
  entity_type: "task",
  entity_id: "2",
  action: "created",
  metadata: {},
  created_at: new Date().toISOString(),
  actor_membership_id: null,
  ...patch,
});

describe("activity sentences", () => {
  it("uses the organization's words", () => {
    const t = createTranslator({ project: { one: "Program", other: "Programs" } });
    expect(describeActivity(row({ entity_type: "project", action: "archived" }), t)).toBe("archived the program");
    expect(describeActivity(row({ action: "created" }), t)).toBe("created a task");
    expect(describeActivity(row({ action: "moved", metadata: { to: "in_progress" } }), t)).toBe("moved a task to In progress");
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-10-07T12:00:00Z");
    expect(timeAgo("2026-10-07T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-07T11:00:00Z", now)).toBe("1 h ago");
    expect(timeAgo("2026-10-05T12:00:00Z", now)).toBe("2 d ago");
  });
});
