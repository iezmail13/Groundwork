import "server-only";
import { createClient } from "@/lib/supabase/server";

// Kanban workflows (D107). RLS shows a program's steps to everyone who can see it.

export type WorkflowStep = { id: string; name: string; kind: "open" | "done"; position: number; wip_limit: number | null };

export async function getWorkflow(projectId: string): Promise<WorkflowStep[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("id, name, kind, position, wip_limit")
    .eq("project_id", projectId)
    .order("position");
  if (error) throw error;
  return data ?? [];
}

/** Ready-made workflows to start from. */
export const WORKFLOW_TEMPLATES: { key: string; name: string; steps: { name: string; kind: "open" | "done"; wip_limit?: number }[] }[] = [
  {
    key: "simple",
    name: "Backlog, doing, review, finished",
    steps: [
      { name: "Backlog", kind: "open" },
      { name: "Doing", kind: "open", wip_limit: 5 },
      { name: "Review", kind: "open" },
      { name: "Finished", kind: "done" },
    ],
  },
  {
    key: "approval",
    name: "Intake and approval",
    steps: [
      { name: "Intake", kind: "open" },
      { name: "Being reviewed", kind: "open", wip_limit: 3 },
      { name: "Waiting on approval", kind: "open" },
      { name: "Approved", kind: "done" },
    ],
  },
  {
    key: "event",
    name: "Planning a gathering",
    steps: [
      { name: "Ideas", kind: "open" },
      { name: "Booked", kind: "open" },
      { name: "Ready", kind: "open" },
      { name: "Held", kind: "done" },
    ],
  },
];
