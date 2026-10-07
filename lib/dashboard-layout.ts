import { z } from "zod";

export const WIDGET_IDS = [
  "overdue",
  "due_soon",
  "quick_add",
  "my_tasks",
  "upcoming_events",
  "project_progress",
  "recent_activity",
  "pinned_documents",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];
export type WidgetSize = "s" | "m" | "l";
export type WidgetLayout = { id: WidgetId; size: WidgetSize; hidden: boolean };
export type DashboardLayout = { version: 1; widgets: WidgetLayout[] };

export const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  widgets: [
    { id: "overdue", size: "s", hidden: false },
    { id: "due_soon", size: "s", hidden: false },
    { id: "quick_add", size: "s", hidden: false },
    { id: "my_tasks", size: "m", hidden: false },
    { id: "upcoming_events", size: "m", hidden: false },
    { id: "project_progress", size: "m", hidden: false },
    { id: "recent_activity", size: "m", hidden: false },
    { id: "pinned_documents", size: "l", hidden: false },
  ],
};

export const layoutSchema = z.object({
  version: z.literal(1),
  widgets: z
    .array(z.object({ id: z.enum(WIDGET_IDS), size: z.enum(["s", "m", "l"]), hidden: z.boolean() }))
    .max(WIDGET_IDS.length)
    .refine((w) => new Set(w.map((x) => x.id)).size === w.length, "Each widget may appear once."),
});

/**
 * Reads a stored layout defensively: unknown widgets are dropped, duplicates
 * collapse to the first, and widgets added since it was saved are appended
 * with their default size.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const widgets: WidgetLayout[] = [];
  const seen = new Set<string>();
  const list = raw && typeof raw === "object" && Array.isArray((raw as { widgets?: unknown }).widgets)
    ? ((raw as { widgets: unknown[] }).widgets)
    : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { id, size, hidden } = item as Record<string, unknown>;
    if (typeof id !== "string" || !(WIDGET_IDS as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    const fallback = DEFAULT_LAYOUT.widgets.find((w) => w.id === id)!;
    widgets.push({
      id: id as WidgetId,
      size: size === "s" || size === "m" || size === "l" ? size : fallback.size,
      hidden: hidden === true,
    });
  }
  for (const w of DEFAULT_LAYOUT.widgets) if (!seen.has(w.id)) widgets.push({ ...w });
  return { version: 1, widgets };
}

/** Grid column spans for each size (12-column grid). */
export const SIZE_CLASSES: Record<WidgetSize, string> = {
  s: "md:col-span-6 xl:col-span-4",
  m: "md:col-span-6 xl:col-span-6",
  l: "md:col-span-12 xl:col-span-12",
};
