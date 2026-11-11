/**
 * The private calendar feed as iCalendar text (RFC 5545), written by hand so
 * no package is needed (D57). Google Calendar, Apple Calendar and Outlook all
 * subscribe to this subset: titles and dates only, nothing else (D102).
 */

export type FeedItem = {
  item_type: string;
  item_id: string;
  title: string;
  /** Calendar items: when they start and end. */
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  /** Work: the day it's due. */
  due_date: string | null;
  updated_at: string;
};

/** Escapes text values: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line so no line is longer than 75 octets, continuing on
 * lines that start with a space, without splitting a multi-byte character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // continuation lines carry a leading space, so they hold one octet less
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** 2026-10-20T13:05:00Z → 20261020T130500Z */
export function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** 2026-10-20 → 20261020 */
function dateValue(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, "");
}

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function eventLines(item: FeedItem, host: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${item.item_type}-${item.item_id}@${host}`,
    `DTSTAMP:${utcStamp(item.updated_at)}`,
    `LAST-MODIFIED:${utcStamp(item.updated_at)}`,
  ];
  if (item.item_type === "task" && item.due_date) {
    // work shows as a free all-day entry on the day it's due
    lines.push(`DTSTART;VALUE=DATE:${dateValue(item.due_date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(item.due_date))}`, "TRANSP:TRANSPARENT");
  } else if (item.starts_at && item.ends_at) {
    if (item.all_day) {
      // all-day items are stored from UTC midnight to the next free UTC midnight
      const start = item.starts_at.slice(0, 10);
      const end = new Date(item.ends_at).toISOString().slice(0, 10);
      lines.push(`DTSTART;VALUE=DATE:${dateValue(start)}`, `DTEND;VALUE=DATE:${dateValue(end > start ? end : nextDay(start))}`);
    } else {
      lines.push(`DTSTART:${utcStamp(item.starts_at)}`, `DTEND:${utcStamp(item.ends_at)}`);
    }
  } else {
    return [];
  }
  lines.push(`SUMMARY:${escapeText(item.title)}`, "END:VEVENT");
  return lines;
}

/** The whole feed, with CRLF line endings as the format requires. */
export function buildCalendar(items: FeedItem[], host: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Groundwork//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Groundwork",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...items.flatMap((item) => eventLines(item, host)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
