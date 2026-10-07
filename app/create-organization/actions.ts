"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, type ActionState } from "@/lib/action-state";

const schema = z.object({
  fullName: z.string().max(120, "Use 120 characters or fewer.").optional(),
  name: z.string({ error: "Give your organization a name." }).min(1, "Give your organization a name.").max(120, "Use 120 characters or fewer."),
  preset: z.enum(["nonprofit", "business", "tutoring"], { error: "Choose how Groundwork should talk." }),
});

export async function createOrganization(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("Your session has ended. Sign in again.");

  if (parsed.data.fullName) {
    await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", auth.user.id);
  }

  const { data, error } = await supabase.rpc("create_organization", {
    name: parsed.data.name,
    preset_key: parsed.data.preset,
  });
  if (error || !data) return dbFailure(error);
  redirect(`/${data.slug}/dashboard`);
}
