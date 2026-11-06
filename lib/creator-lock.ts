import { outrankedByCreator, ROLES, type Role, type Viewer } from "@/lib/roles";
import { lower, type Translate } from "@/lib/terminology/t";

/**
 * Why the viewer can't change something, when someone ranked above them made
 * it (see guard_creator_rank in the database); null when they can.
 */
export function creatorLock(t: Translate, viewer: Viewer, creatorId: string | null, creatorRole: Role | null): string | null {
  if (!creatorRole || !outrankedByCreator(viewer, creatorId, creatorRole)) return null;
  const one = lower(t(`role.${creatorRole}`));
  const article = /^[aeiou]/.test(one) ? "an" : "a";
  return creatorRole === ROLES[0]
    ? `${capitalize(article)} ${one} made this, so only they or another ${one} can change it.`
    : `${capitalize(article)} ${one} made this, so only they or someone ranked ${one} or above can change it.`;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
