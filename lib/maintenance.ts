import { z } from "zod";

// Maintenance mode (D87). The setting lives outside the database, in Vercel
// Edge Config (or environment variables), so the maintenance page works while
// the database is being migrated or is down. Everything here is pure, so the
// proxy, the pages and the GitHub workflow share it and it is unit-tested.

export type MaintenanceSetting = {
  active: boolean;
  message: string;
  /** ISO instants, or null. */
  startsAt: string | null;
  endsAt: string | null;
};

export const NO_MAINTENANCE: MaintenanceSetting = { active: false, message: "", startsAt: null, endsAt: null };

/** Where people can write while the site is down (the owner's choice). */
export const CONTACT_EMAIL = "groundworkceo@gmail.com";

/** Request header the proxy uses to hand the current setting to pages. */
export const MAINTENANCE_HEADER = "x-gw-maintenance";

/** Scheduled notices show this long before maintenance starts. */
export const NOTICE_WINDOW_MS = 48 * 60 * 60 * 1000;

const instant = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Use a date and time, e.g. 2026-10-25T22:00:00-04:00.")
  .transform((v) => new Date(v).toISOString());

const optionalInstant = z
  .union([z.null(), z.literal(""), instant])
  .optional()
  .transform((v) => (v ? v : null));

export const settingSchema = z
  .object({
    active: z.boolean(),
    message: z.string().max(500, "Keep the message to 500 characters.").default(""),
    starts_at: optionalInstant,
    ends_at: optionalInstant,
  })
  .refine((s) => !s.starts_at || !s.ends_at || s.ends_at > s.starts_at, {
    message: "The end time must be after the start time.",
    path: ["ends_at"],
  })
  .transform(
    (s): MaintenanceSetting => ({ active: s.active, message: s.message.trim(), startsAt: s.starts_at, endsAt: s.ends_at }),
  );

/** Reads a stored setting defensively: anything malformed means "no maintenance". */
export function parseSetting(raw: unknown): MaintenanceSetting {
  const parsed = settingSchema.safeParse(raw);
  return parsed.success ? parsed.data : NO_MAINTENANCE;
}

/** The fallback when Edge Config isn't configured: MAINTENANCE_* environment variables. */
export function settingFromEnv(env: Record<string, string | undefined>): MaintenanceSetting {
  const active = /^(1|true|on|yes)$/i.test(env.MAINTENANCE_MODE?.trim() ?? "");
  return parseSetting({
    active,
    message: env.MAINTENANCE_MESSAGE ?? "",
    starts_at: env.MAINTENANCE_STARTS_AT ?? null,
    ends_at: env.MAINTENANCE_ENDS_AT ?? null,
  });
}

/** Back in the JSON shape Edge Config stores. */
export function toStored(s: MaintenanceSetting) {
  return { active: s.active, message: s.message, starts_at: s.startsAt, ends_at: s.endsAt };
}

/** A scheduled window that hasn't started yet and starts within 48 hours. */
export function upcomingWindow(s: MaintenanceSetting, now: Date = new Date()): { startsAt: string; endsAt: string | null } | null {
  if (s.active || !s.startsAt) return null;
  const start = Date.parse(s.startsAt);
  const ms = start - now.getTime();
  if (ms <= 0 || ms > NOTICE_WINDOW_MS) return null;
  return { startsAt: s.startsAt, endsAt: s.endsAt };
}

/** Seconds to put in Retry-After: until the expected end, or five minutes when unknown or past. */
export function retryAfterSeconds(s: MaintenanceSetting, now: Date = new Date()): number {
  if (!s.endsAt) return 300;
  const seconds = Math.ceil((Date.parse(s.endsAt) - now.getTime()) / 1000);
  return seconds > 0 ? Math.min(seconds, 24 * 60 * 60) : 300;
}

/**
 * "Sat 25 Oct, 10:00–11:00 pm EDT" in the viewer's time zone. The end is left
 * out when unknown; a window over midnight names both days.
 */
export function formatWindow(startsAt: string, endsAt: string | null, timeZone: string, locale = "en-CA"): string {
  const start = new Date(startsAt);
  const day = (d: Date) =>
    new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short" }).format(d).replace(/\.$/, "");
  const time = (d: Date, zone: boolean) =>
    new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit", ...(zone ? { timeZoneName: "short" } : {}) })
      .format(d)
      .replace(/\s?([ap])\.m\./gi, (_, p: string) => ` ${p.toLowerCase()}m`);
  if (!endsAt) return `${day(start)}, ${time(start, true)}`;
  const end = new Date(endsAt);
  const sameDay = day(start) === day(end);
  // "10:00–11:00 pm": the start drops am/pm when it matches the end's
  const startTime = time(start, false);
  const endTime = time(end, true);
  const period = / ([ap]m)$/.exec(startTime)?.[1];
  const shortStart = period && endTime.includes(` ${period}`) ? startTime.slice(0, -3) : startTime;
  return sameDay
    ? `${day(start)}, ${shortStart}–${endTime}`
    : `${day(start)}, ${time(start, false)} – ${day(end)}, ${time(end, true)}`;
}

/** Hashes a bypass token, so the cookie never holds the token itself. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`groundwork-maintenance:${token}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that depends only on their length. */
export function safeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Paths that stay reachable during maintenance (static assets never reach the proxy). */
export function servedDuringMaintenance(pathname: string): boolean {
  return pathname === "/" || pathname === "/maintenance" || pathname === "/maintenance/status";
}
