"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, success, type ActionState } from "@/lib/action-state";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, THEME_MODES } from "@/lib/theme/mode";

const mode = z.enum(THEME_MODES, { error: "Choose light, dark or system." });

/** Saves the viewer's light/dark/system choice on their profile and in the theme cookie. */
export async function setThemeMode(value: string): Promise<ActionState> {
  const parsed = mode.safeParse(value);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Choose light, dark or system.");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return failure("Sign in again to change this.");
  const { error } = await supabase.from("profiles").update({ theme_mode: parsed.data }).eq("id", data.user.id);
  if (error) return dbFailure(error);
  (await cookies()).set(THEME_COOKIE, parsed.data, { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "lax" });
  return success("Appearance saved.");
}
