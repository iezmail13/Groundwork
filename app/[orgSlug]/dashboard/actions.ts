"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { layoutSchema, type DashboardLayout } from "@/lib/dashboard-layout";
import { id } from "@/lib/validation";

export type SaveResult = { ok: true } | { ok: false; message: string };

/** Saves the viewer's own layout (RLS: a member can only write their own row). */
export async function saveDashboardLayout(organizationId: string, layout: DashboardLayout): Promise<SaveResult> {
  const parsed = z.object({ organizationId: id, layout: layoutSchema }).safeParse({ organizationId, layout });
  if (!parsed.success) return { ok: false, message: "That layout isn't valid." };
  const supabase = await createClient();
  const { data: membershipId } = await supabase.rpc("my_membership_id", { org_id: parsed.data.organizationId });
  if (!membershipId) return { ok: false, message: "You don't belong to this organization." };

  const { error } = await supabase
    .from("dashboard_layouts")
    .upsert(
      { organization_id: parsed.data.organizationId, membership_id: membershipId, layout: parsed.data.layout },
      { onConflict: "membership_id" },
    );
  if (error) return { ok: false, message: "Couldn't save your layout. Try again." };
  return { ok: true };
}
