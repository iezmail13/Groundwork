// Date helpers. Due dates are plain calendar dates (YYYY-MM-DD). Event times
// are instants rendered in the viewer's time zone, which the browser reports
// through the "tz" cookie (see components/timezone-sync.tsx).

export const LOCALE = "en-US";
export const DEFAULT_TZ = "UTC";
export const DUE_SOON_DAYS = 2;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isTime(value: string): boolean {
  return TIME.test(value);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dateInZone(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Wall-clock time (HH:mm) of an instant in a time zone. */
export function timeInZone(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function todayIn(tz: string, now: Date = new Date()): string {
  return dateInZone(now, tz);
}

/** Offset of `tz` from UTC at `date`, in minutes (e.g. -240 for EDT). */
function offsetMinutes(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** The instant at which the wall clock in `tz` reads `date time`. */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - offsetMinutes(new Date(guess), tz) * 60000;
  // second pass settles instants near a DST transition
  result = guess - offsetMinutes(new Date(result), tz) * 60000;
  return new Date(result);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export type DueState = "overdue" | "due_soon" | "due_later" | "none";

/** Reminder state of a task. Done tasks are never overdue. */
export function dueState(dueDate: string | null, status: string, today: string): DueState {
  if (!dueDate || status === "done") return "none";
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return "overdue";
  if (diff <= DUE_SOON_DAYS) return "due_soon";
  return "due_later";
}

export function formatDate(isoDate: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", ...options }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** "Today", "Tomorrow", "Yesterday", or a short date. */
export function formatRelativeDate(isoDate: string, today: string): string {
  const diff = daysBetween(today, isoDate);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return formatDate(isoDate, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(instant: string | Date, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(instant));
}

export function formatTimestamp(instant: string | Date, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

/** Calendar date an event starts on, for the viewer (all-day events use UTC). */
export function eventStartDate(startsAt: string, allDay: boolean, tz: string): string {
  return dateInZone(new Date(startsAt), allDay ? "UTC" : tz);
}

export function eventEndDate(endsAt: string, allDay: boolean, tz: string): string {
  if (allDay) {
    // stored as an exclusive UTC midnight
    return addDays(dateInZone(new Date(endsAt), "UTC"), -1);
  }
  return dateInZone(new Date(endsAt), tz);
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function formatMonth(month: string): string {
  return formatDate(`${month}-01`, { month: "long", year: "numeric" });
}

/** Weeks (Monday first) covering a month, as rows of ISO dates. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  let cursor = addDays(first, -weekday);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  } while (monthKey(cursor) === month);
  return weeks;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
