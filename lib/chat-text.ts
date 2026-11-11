// Chat text (D106). A mention is stored in the message as <@user-id> and shown
// as "@Name", read live, so a renamed person's mentions follow them. The
// composer shows "@Name" while typing and turns it into the token on send.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TOKEN_RE = new RegExp(`<@(${UUID})>`, "g");

export const MAX_MESSAGE_LENGTH = 4000;

export type Segment = { kind: "text"; text: string } | { kind: "mention"; userId: string };
export type Picked = { userId: string; name: string };

/** Splits stored text into plain runs and mentions. */
export function splitMentions(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN_RE)) {
    if (match.index > last) out.push({ kind: "text", text: body.slice(last, match.index) });
    out.push({ kind: "mention", userId: match[1]! });
    last = match.index + match[0].length;
  }
  if (last < body.length) out.push({ kind: "text", text: body.slice(last) });
  return out;
}

/** The people a stored text mentions, once each, in order. */
export function mentionedIds(body: string): string[] {
  return [...new Set([...body.matchAll(TOKEN_RE)].map((m) => m[1]!))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turns "@Name" for each picked person into their token. Longer names go
 * first, so "@Sam Lee" isn't taken for "@Sam". A name only counts when it
 * isn't followed by more letters ("@Samantha" isn't "@Sam").
 */
export function toTokens(text: string, picked: Picked[]): string {
  let out = text;
  for (const p of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    out = out.replace(new RegExp(`@${escape(p.name)}(?![\\p{L}\\p{N}])`, "gu"), `<@${p.userId}>`);
  }
  return out;
}

/** The reverse, for editing: tokens back to "@Name", and who was picked. */
export function fromTokens(body: string, nameOf: (userId: string) => string | undefined): { text: string; picked: Picked[] } {
  const picked: Picked[] = [];
  const text = splitMentions(body)
    .map((s) => {
      if (s.kind === "text") return s.text;
      const name = nameOf(s.userId) ?? "someone";
      if (!picked.some((p) => p.userId === s.userId)) picked.push({ userId: s.userId, name });
      return `@${name}`;
    })
    .join("");
  return { text, picked };
}

/**
 * The mention being typed at the caret, if any: an "@" at the start or after
 * a space, followed by up to two words.
 */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([\p{L}\p{N}'.-]*(?: [\p{L}\p{N}'.-]*)?)$/u.exec(before);
  if (!match) return null;
  return { start: before.length - match[2]!.length - 1, query: match[2]! };
}
