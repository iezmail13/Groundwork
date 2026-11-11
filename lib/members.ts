import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getMembers, initials, type Member } from "@/lib/org";
import { getPendingInvitees } from "@/lib/projects";

// Member profiles (D104): photos are signed per request from the private
// "profile-photos" bucket, which only the organization's members can read.

export type Avatar = { initials: string; name: string; photoUrl: string | null; href: string | null; userId: string | null };

/** Signed links to members' photos, by user id. */
export const getMemberPhotos = cache(async (orgId: string): Promise<Map<string, string>> => {
  const members = await getMembers(orgId);
  const withPhotos = members.filter((m): m is Member & { photoPath: string } => Boolean(m.photoPath));
  if (withPhotos.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("profile-photos").createSignedUrls(
    withPhotos.map((m) => m.photoPath),
    60 * 60,
  );
  const byPath = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
  return new Map(withPhotos.flatMap((m) => (byPath.has(m.photoPath) ? [[m.userId, byPath.get(m.photoPath)!] as const] : [])));
});

/**
 * Everyone who can be on a task, keyed by membership id (or invitation id for
 * people who haven't joined yet), with their photo and profile link.
 */
export async function getAvatars(orgId: string, base: string): Promise<Record<string, Avatar>> {
  const [members, invitees, photos] = await Promise.all([getMembers(orgId), getPendingInvitees(orgId), getMemberPhotos(orgId)]);
  return Object.fromEntries([
    ...members.map((m) => [
      m.id,
      { initials: initials(m.name), name: m.name, photoUrl: photos.get(m.userId) ?? null, href: `${base}/members/${m.userId}`, userId: m.userId },
    ]),
    ...invitees.map((i) => [
      i.id,
      { initials: initials(i.name), name: `${i.name} (pending)`, photoUrl: null, href: null, userId: null },
    ]),
  ]);
}
