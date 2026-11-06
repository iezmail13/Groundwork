"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, id, participantFileInput, participantUploadRequestInput } from "@/lib/validation";
import { DEMO_ONLY } from "@/lib/demo";
import { inDemo } from "@/lib/demo-server";

// Participant files (D56, D102). The database decides who may upload, open
// and delete them, and records each of those; these actions validate input,
// move the bytes and word the result.

const PARTICIPANT_BUCKET = "participant-files";

function revalidateAttendance() {
  revalidatePath("/[orgSlug]/attendance", "layout");
}

export type ParticipantUploadTicket = { ok: true; path: string; token: string } | { ok: false; message: string };

/**
 * Step 1: check the file's details and hand back a signed upload URL for a
 * server-chosen path, {organization}/{program}/{participant}/{uuid}. Storage
 * refuses it unless the caller may add files to that participant there.
 */
export async function requestParticipantUpload(input: {
  organizationId: string;
  projectId: string;
  participantId: string;
  fileName: string;
  size: number;
  mimeType: string;
}): Promise<ParticipantUploadTicket> {
  const parsed = participantUploadRequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That file can't be uploaded." };
  const d = parsed.data;
  const supabase = await createClient();
  const path = `${d.organizationId}/${d.projectId}/${d.participantId}/${crypto.randomUUID()}`;
  if (await inDemo(supabase)) return { ok: false, message: DEMO_ONLY };
  const { data, error } = await supabase.storage.from(PARTICIPANT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "You can't add files for them there." };
  return { ok: true, path: data.path, token: data.token };
}

function belongs(path: string, d: { organizationId: string; projectId: string; participantId: string }) {
  return path.startsWith(`${d.organizationId}/${d.projectId}/${d.participantId}/`) && !path.includes("..");
}

/** Step 2: record the uploaded file, using the size and type storage saw. */
export async function finishParticipantUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formObject(formData);
  const parsed = participantFileInput.safeParse(raw);
  const supabase = await createClient();
  const discard = async (path: string | undefined) => {
    // only the uploader can remove an object nobody has recorded yet
    if (path && !path.includes("..")) await supabase.storage.from(PARTICIPANT_BUCKET).remove([path]);
  };
  if (!parsed.success) {
    await discard(raw.storagePath);
    return invalid(parsed.error);
  }
  const d = parsed.data;
  if (!belongs(d.storagePath, d)) return failure("That upload doesn't belong here.");

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");

  const { data: info, error: infoError } = await supabase.storage.from(PARTICIPANT_BUCKET).info(d.storagePath);
  if (infoError || !info) return failure("The file didn't finish uploading. Try again.");
  const size = info.size ?? 0;
  const mime = (info.contentType ?? "").split(";")[0]!.trim();
  if (size > MAX_UPLOAD_BYTES || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    await discard(d.storagePath);
    return failure("That file type or size isn't allowed.");
  }

  const { error } = await supabase.from("participant_files").insert({
    organization_id: d.organizationId,
    project_id: d.projectId,
    participant_id: d.participantId,
    kind: d.kind,
    name: d.name,
    storage_path: d.storagePath,
    mime_type: mime,
    size_bytes: size,
    uploaded_by: auth.user.id,
  });
  if (error) {
    // never clean up a path that already belongs to a recorded file
    if (error.code !== "23505") await discard(d.storagePath);
    return dbFailure(error);
  }
  revalidateAttendance();
  return success(`Added “${d.name}”.`);
}

/**
 * Deletes a file: the row first (which records the deletion), then the
 * stored copy, which the recorded deletion lets the caller remove.
 */
export async function deleteParticipantFile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id }).safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("participant_files").delete().eq("id", parsed.data.id).select("storage_path, name");
  if (error) return dbFailure(error);
  const row = data?.[0];
  if (!row) return failure("You can't delete this file, or it no longer exists.");
  const { error: storageError } = await supabase.storage.from(PARTICIPANT_BUCKET).remove([row.storage_path]);
  if (storageError) console.error("File record deleted but its stored copy could not be removed", parsed.data.id, storageError);
  revalidateAttendance();
  return success(`Deleted “${row.name}”.`);
}
