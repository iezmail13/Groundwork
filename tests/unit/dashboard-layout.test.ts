import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, WIDGET_IDS, layoutSchema, normalizeLayout } from "@/lib/dashboard-layout";

describe("dashboard layout", () => {
  it("falls back to the default for missing or junk data", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({ widgets: "nope" })).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps the saved order, sizes and visibility", () => {
    const saved = { version: 1, widgets: [{ id: "recent_activity", size: "l", hidden: false }, { id: "overdue", size: "m", hidden: true }] };
    const layout = normalizeLayout(saved);
    expect(layout.widgets[0]).toEqual({ id: "recent_activity", size: "l", hidden: false });
    expect(layout.widgets[1]).toEqual({ id: "overdue", size: "m", hidden: true });
    expect(layout.widgets).toHaveLength(WIDGET_IDS.length);
  });

  it("drops unknown widgets and duplicates, and repairs bad sizes", () => {
    const layout = normalizeLayout({
      widgets: [{ id: "weather", size: "s" }, { id: "overdue", size: "xl" }, { id: "overdue", size: "l" }],
    });
    expect(layout.widgets.filter((w) => w.id === "overdue")).toEqual([{ id: "overdue", size: "s", hidden: false }]);
    expect(layout.widgets.map((w) => w.id)).not.toContain("weather");
  });

  it("validates layouts sent to the server", () => {
    expect(layoutSchema.safeParse(DEFAULT_LAYOUT).success).toBe(true);
    const dupes = { version: 1, widgets: [DEFAULT_LAYOUT.widgets[0], DEFAULT_LAYOUT.widgets[0]] };
    expect(layoutSchema.safeParse(dupes).success).toBe(false);
    expect(layoutSchema.safeParse({ version: 2, widgets: [] }).success).toBe(false);
  });
});
