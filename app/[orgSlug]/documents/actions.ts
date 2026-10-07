"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, failure, formObject, invalid, success, type ActionState } from "@/lib/action-state";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  documentInput,
  documentUpdateInput,
  id,
  sanitizeFileName,
  uploadRequestInput,
} from "@/lib/validation";

const BUCKET = "documents";

function revalidateOrg() {
  revalidatePath("/[orgSlug]", "layout");
}

export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; message: string };

/**
 * Step 1 of an upload: validate the file's metadata and hand back a signed
 * upload URL for a server-chosen path, {organization_id}/{uuid}-{filename}.
 * The browser then uploads straight to storage (Vercel functions cap request
 * bodies well below 25 MB), and the bucket re-checks size and type.
 */
export async function requestUpload(input: {
  organizationId: string;
  fileName: string;
  size: number;
  mimeType: string;
}): Promise<UploadTicket> {
  const parsed = uploadRequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That file can't be uploaded." };
  const supabase = await createClient();
  const { data: member } = await supabase.rpc("is_member", { org_id: parsed.data.organizationId });
  if (!member) return { ok: false, message: "You don't have permission to upload here." };

  const path = `${parsed.data.organizationId}/${crypto.randomUUID()}-${sanitizeFileName(parsed.data.fileName)}`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Couldn't start the upload. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

/** Step 2: record the uploaded object, using the size and type storage saw. */
export async function finishUpload(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = documentInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (!d.storagePath.startsWith(`${d.organizationId}/`) || d.storagePath.includes("..")) {
    return failure("That upload doesn't belong to this organization.");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("You've been signed out. Sign in again.");

  const { data: info, error: infoError } = await supabase.storage.from(BUCKET).info(d.storagePath);
  if (infoError || !info) return failure("The file didn't finish uploading. Try again.");
  const size = info.size ?? 0;
  const mime = (info.contentType ?? "").split(";")[0]!.trim();
  if (size > MAX_UPLOAD_BYTES || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    await supabase.storage.from(BUCKET).remove([d.storagePath]);
    return failure("That file type or size isn't allowed.");
  }

  const { error } = await supabase.from("documents").insert({
    organization_id: d.organizationId,
    project_id: d.projectId ?? null,
    name: d.name,
    storage_path: d.storagePath,
    mime_type: mime,
    size_bytes: size,
    tags: d.tags,
    uploaded_by: auth.user.id,
  });
  if (error) {
    // never clean up a path that already belongs to another document
    if (error.code !== "23505") await supabase.storage.from(BUCKET).remove([d.storagePath]);
    return dbFailure(error);
  }
  revalidateOrg();
  return success(`Uploaded “${d.name}”.`);
}

export async function updateDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = documentUpdateInput.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ name: parsed.data.name, project_id: parsed.data.projectId ?? null, tags: parsed.data.tags })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return dbFailure(error);
  if (!data?.length) return failure("You can't edit this, or it no longer exists.");
  revalidateOrg();
  return success("Saved.");
}

export async function togglePin(formData: FormData): Promise<void> {
  const parsed = z.object({ id, pinned: z.enum(["true", "false"]) }).safeParse(formObject(formData));
  if (!parsed.success) throw new Error("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.from("documents").update({ pinned: parsed.data.pinned === "true" }).eq("id", parsed.data.id);
  if (error) throw new Error("Couldn't update the pin. Try again.");
  revalidateOrg();
}

/** Admins delete anything; members delete what they uploaded (RLS enforces both). */
export async function deleteDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id }).safeParse(formObject(formData));
  if (!parsed.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", parsed.data.id).select("storage_path");
  if (error) return dbFailure(error);
  const row = data?.[0];
  if (!row) return failure("Only an admin or the person who uploaded this can delete it.");
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
  if (storageError) console.error("Row deleted but the stored file could not be removed", row.storage_path, storageError);
  revalidateOrg();
  return success("Deleted.");
}
