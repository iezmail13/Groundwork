"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { id, isoDate } from "@/lib/validation";

// RLS decides who may do each of these (owners, and project admins and leads
// of programs that track participants; permanent deletion needs manager or
// owner). These actions validate input and word the result.

function revalidateAttendance() {
  revalidatePath("/[orgSlug]/attendance", "layout");
}

const NOT_ALLOWED = "You can't change this, or it no longer exists.";

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v))
    .optional()
    .transform((v) => v ?? null);

const slug = z.string().regex(/^[a-z0-9-]{1,48}$/);

export async function addParticipant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      orgSlug: slug,
      projectId: id,
      name: z.string({ error: "Add a name." }).trim().min(1, "Add a name.").max(120, "Use 120 characters or fewer."),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("add_participant", { project_id: parsed.data.projectId, name: parsed.data.name });
  if (error) return dbFailure(error);
  revalidateAttendance();
  redirect(`/${parsed.data.orgSlug}/attendance/participants/${newId}?notice=added`);
}

const participantInput = z.object({
  id,
  name: z.string({ error: "Add a name." }).trim().min(1, "Add a name.").max(120, "Use 120 characters or fewer."),
  email: z
    .string()
    .trim()
    .max(254)
    .transform((v) => (v === "" ? null : v.toLowerCase()))
    .pipe(z.email("Enter a valid email address.").nullable())
    .optional()
    .transform((v) => v ?? null),
  phone: optional(40, "Use 40 characters or fewer."),
  dateOfBirth: z
    .union([z.literal(""), isoDate])
    .optional()
    .transform((v) => (v ? v : null)),
  guardianName: optional(120, "Use 120 characters or fewer."),
  emergencyContact: optional(200, "Use 200 characters or fewer."),
  careNotes: optional(2000, "Use 2,000 characters or fewer."),
  notes: optional(4000, "Use 4,000 characters or fewer."),
});

export async function updateParticipant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = participantInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  if (d.dateOfBirth && d.dateOfBirth > today) return failure("Check the highlighted fields.", { dateOfBirth: ["That date is in the future."] });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .update({
      name: d.name,
      email: d.email,
      phone: d.phone,
      date_of_birth: d.dateOfBirth,
      guardian_name: d.guardianName,
      emergency_contact: d.emergencyContact,
      care_notes: d.careNotes,
      notes: d.notes,
    })
    .eq("id", d.id)
    .select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ALLOWED);
  revalidateAttendance();
  return success("Saved.");
}

/** Archive (hide from rosters and check-in, keep history) or restore one or more participants. */
export async function setParticipantsArchived(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ ids: z.array(id).min(1, "Choose at least one.").max(500), archived: z.enum(["true", "false"]) })
    .safeParse({ ids: formData.getAll("ids"), archived: formData.get("archived") });
  if (!parsed.success) return invalid(parsed.error);
  const archive = parsed.data.archived === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("participants")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .in("id", parsed.data.ids)
    .select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure(NOT_ALLOWED);
  revalidateAttendance();
  const n = data.length;
  return success(`${archive ? "Archived" : "Restored"} ${n}.`);
}

export async function enrollParticipant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ organizationId: id, participantId: id, projectId: id }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("participant_programs").insert({
    organization_id: parsed.data.organizationId,
    participant_id: parsed.data.participantId,
    project_id: parsed.data.projectId,
  });
  if (error?.code === "23505") return failure("They're already enrolled there.");
  if (error) return dbFailure(error);
  revalidateAttendance();
  return success("Enrolled.");
}

export async function unenrollParticipant(formData: FormData): Promise<void> {
  const parsed = z.object({ participantId: id, projectId: id }).safeParse(formObject(formData));
  if (!parsed.success) throw new Error("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("participant_programs")
    .delete()
    .eq("participant_id", parsed.data.participantId)
    .eq("project_id", parsed.data.projectId);
  if (error) throw new Error("Couldn't change the enrollment. Try again.");
  revalidateAttendance();
}

/**
 * Permanent deletion, for privacy requests. The participant's details are
 * erased; their attendance marks stay without a name, so session counts and
 * program rates don't change.
 */
export async function deleteParticipant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id, orgSlug: slug, confirm: z.string().trim().max(200) }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: row } = await supabase.from("participants").select("name").eq("id", parsed.data.id).maybeSingle();
  if (!row) return failure(NOT_ALLOWED);
  if (parsed.data.confirm !== row.name.trim()) {
    return failure("Type their name exactly as shown to confirm.", { confirm: ["The name doesn't match."] });
  }
  // their files go with them: the database deletes the rows (recording each
  // deletion), which lets this caller remove the stored copies straight after
  const { data: files } = await supabase.from("participant_files").select("storage_path").eq("participant_id", parsed.data.id);
  const { data, error } = await supabase.from("participants").delete().eq("id", parsed.data.id).select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("Your role can't delete someone permanently. Archive them instead.");
  const paths = (files ?? []).map((f) => f.storage_path);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("participant-files").remove(paths);
    if (storageError) console.error("Record deleted but some stored files could not be removed", parsed.data.id, storageError);
  }
  revalidateAttendance();
  redirect(`/${parsed.data.orgSlug}/attendance?notice=deleted`);
}

const markStatus = z.enum(["present", "late", "absent", "excused"]);

/**
 * Saves a session's check-in: `status.<participantId>` is a mark or empty
 * (no mark), `note.<participantId>` an optional note.
 */
export async function saveAttendance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  const base = z.object({ organizationId: id, eventId: id }).safeParse(raw);
  if (!base.success) return invalid(base.error);
  const marks: { participantId: string; status: z.infer<typeof markStatus> | null; note: string | null }[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith("status.")) continue;
    const participantId = id.safeParse(key.slice("status.".length));
    // formObject() turns an empty choice ("no mark") into undefined
    const status = value === undefined ? { success: true as const, data: null } : markStatus.safeParse(value);
    const note = z.string().trim().max(500, "Keep notes to 500 characters.").safeParse(raw[`note.${key.slice(7)}`] ?? "");
    if (!participantId.success || !status.success) return failure("Check the marks and try again.");
    if (!note.success) return failure(note.error.issues[0]?.message ?? "Check the notes.");
    marks.push({ participantId: participantId.data, status: status.data, note: note.data || null });
  }
  if (marks.length > 1000) return failure("That's too many at once.");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");
  const { organizationId, eventId } = base.data;
  const now = new Date().toISOString();

  const toSave = marks.filter((m) => m.status);
  if (toSave.length) {
    const { error } = await supabase.from("attendance").upsert(
      toSave.map((m) => ({
        organization_id: organizationId,
        event_id: eventId,
        participant_id: m.participantId,
        status: m.status!,
        note: m.note,
        recorded_by: auth.user.id,
        recorded_at: now,
      })),
      { onConflict: "event_id,participant_id" },
    );
    if (error) return dbFailure(error);
  }
  const cleared = marks.filter((m) => !m.status).map((m) => m.participantId);
  if (cleared.length) {
    const { error } = await supabase.from("attendance").delete().eq("event_id", eventId).in("participant_id", cleared);
    if (error) return dbFailure(error);
  }
  revalidateAttendance();
  return success(`Saved ${toSave.length} ${toSave.length === 1 ? "mark" : "marks"}.`);
}
